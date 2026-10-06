import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = 'https://rpc.botchain.ai';
const EXPECTED_CHAIN_ID = 677;

async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function waitForReceipt(txHash, maxAttempts = 30, intervalMs = 2000) {
  process.stdout.write(`Waiting for tx ${txHash} `);
  for (let i = 0; i < maxAttempts; i++) {
    const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
    if (receipt && receipt.blockNumber) {
      process.stdout.write('\n');
      return receipt;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for tx receipt: ${txHash}`);
}

function loadArtifact(name) {
  const p = path.resolve(`artifacts/${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  console.log('=== AgentForge BOT Chain Mainnet Deployment ===\n');

  const privateKeyRaw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKeyRaw) {
    throw new Error('DEPLOYER_PRIVATE_KEY missing in .env');
  }
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : '0x' + privateKeyRaw;
  const wallet = new ethers.Wallet(privateKey);
  console.log('Deployer Address:', wallet.address);

  // 1. Verify Chain ID
  const chainIdHex = await rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log(`Network Chain ID: ${chainId} (Expected: ${EXPECTED_CHAIN_ID})`);
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Chain ID mismatch! Expected ${EXPECTED_CHAIN_ID}, got ${chainId}`);
  }

  // 2. Check balance
  const balanceHex = await rpcCall('eth_getBalance', [wallet.address, 'latest']);
  const balance = BigInt(balanceHex);
  console.log(`Deployer Balance: ${ethers.formatEther(balance)} BOT`);
  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 BOT balance!');
  }

  // 3. Get current gas price
  const gasPriceHex = await rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log(`Current Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);

  // 4. Get current nonce
  let nonce = parseInt(await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']), 16);
  console.log(`Current Nonce: ${nonce}\n`);

  // --- Step 1: Deploy AgentVault Implementation ---
  console.log('--- Step 1: Deploying AgentVault Implementation ---');
  const vaultArtifact = loadArtifact('AgentVault');

  const vaultEstGasHex = await rpcCall('eth_estimateGas', [{ from: wallet.address, data: vaultArtifact.bytecode }]);
  const vaultGasLimit = (BigInt(vaultEstGasHex) * 125n) / 100n;
  console.log(`Estimated gas for AgentVault: ${BigInt(vaultEstGasHex)} -> limit: ${vaultGasLimit}`);

  const vaultDeployTx = {
    to: null,
    data: vaultArtifact.bytecode,
    nonce: nonce++,
    gasLimit: vaultGasLimit,
    gasPrice: gasPrice,
    chainId: EXPECTED_CHAIN_ID,
    value: 0n
  };

  const signedVaultDeploy = await wallet.signTransaction(vaultDeployTx);
  const vaultTxHash = await rpcCall('eth_sendRawTransaction', [signedVaultDeploy]);
  console.log('AgentVault deployment tx broadcasted:', vaultTxHash);

  const vaultReceipt = await waitForReceipt(vaultTxHash);
  if (vaultReceipt.status !== '0x1') {
    throw new Error(`AgentVault deployment failed! Status: ${vaultReceipt.status}`);
  }
  const vaultImplAddress = vaultReceipt.contractAddress;
  console.log(`✓ AgentVault Implementation deployed at: ${vaultImplAddress}`);
  console.log(`  Gas used: ${parseInt(vaultReceipt.gasUsed, 16)}\n`);

  // --- Step 2: Deploy AgentForgeFactory ---
  console.log('--- Step 2: Deploying AgentForgeFactory ---');
  const factoryArtifact = loadArtifact('AgentForgeFactory');
  const factoryContractFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode);
  const deployData = await factoryContractFactory.getDeployTransaction(vaultImplAddress);

  const factoryEstGasHex = await rpcCall('eth_estimateGas', [{ from: wallet.address, data: deployData.data }]);
  const factoryGasLimit = (BigInt(factoryEstGasHex) * 125n) / 100n;
  console.log(`Estimated gas for AgentForgeFactory: ${BigInt(factoryEstGasHex)} -> limit: ${factoryGasLimit}`);

  const factoryDeployTx = {
    to: null,
    data: deployData.data,
    nonce: nonce++,
    gasLimit: factoryGasLimit,
    gasPrice: gasPrice,
    chainId: EXPECTED_CHAIN_ID,
    value: 0n
  };

  const signedFactoryDeploy = await wallet.signTransaction(factoryDeployTx);
  const factoryTxHash = await rpcCall('eth_sendRawTransaction', [signedFactoryDeploy]);
  console.log('AgentForgeFactory deployment tx broadcasted:', factoryTxHash);

  const factoryReceipt = await waitForReceipt(factoryTxHash);
  if (factoryReceipt.status !== '0x1') {
    throw new Error(`AgentForgeFactory deployment failed! Status: ${factoryReceipt.status}`);
  }
  const factoryAddress = factoryReceipt.contractAddress;
  console.log(`✓ AgentForgeFactory deployed at: ${factoryAddress}`);
  console.log(`  Gas used: ${parseInt(factoryReceipt.gasUsed, 16)}\n`);

  // --- Verification on-chain ---
  console.log('--- Step 3: Verifying on-chain state ---');
  const factoryContract = new ethers.Contract(factoryAddress, factoryArtifact.abi);
  const implCallData = factoryContract.interface.encodeFunctionData('vaultImplementation');
  const verifiedImplHex = await rpcCall('eth_call', [{ to: factoryAddress, data: implCallData }, 'latest']);
  const [verifiedImpl] = factoryContract.interface.decodeFunctionResult('vaultImplementation', verifiedImplHex);
  console.log(`Verified vaultImplementation on Factory: ${verifiedImpl}`);

  const totalAgentsCallData = factoryContract.interface.encodeFunctionData('totalAgents');
  const totalAgentsHex = await rpcCall('eth_call', [{ to: factoryAddress, data: totalAgentsCallData }, 'latest']);
  const [totalAgents] = factoryContract.interface.decodeFunctionResult('totalAgents', totalAgentsHex);
  console.log(`Verified totalAgents: ${totalAgents.toString()}`);

  const deploymentInfo = {
    chainId: EXPECTED_CHAIN_ID,
    network: 'BOT Chain Mainnet',
    rpcUrl: RPC_URL,
    vaultImplementation: vaultImplAddress,
    factoryAddress: factoryAddress,
    deployerAddress: wallet.address,
    vaultTxHash,
    factoryTxHash,
    deployedAt: new Date().toISOString()
  };

  const deployRecordPath = path.resolve('deployment.json');
  fs.writeFileSync(deployRecordPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment details saved to: ${deployRecordPath}`);

  // Also export to Frontend src/lib/contracts.json
  const frontendContractsPath = path.resolve('AgentForge Frontend/src/lib/contracts.json');
  fs.writeFileSync(frontendContractsPath, JSON.stringify({
    factoryAddress,
    vaultImplementation: vaultImplAddress,
    chainId: EXPECTED_CHAIN_ID,
    factoryAbi: factoryArtifact.abi,
    vaultAbi: vaultArtifact.abi
  }, null, 2));
  console.log(`Contract metadata exported to: ${frontendContractsPath}`);

  console.log('\n======================================================');
  console.log('🎉 BOT CHAIN MAINNET DEPLOYMENT COMPLETED SUCCESSFULLY');
  console.log(`AgentForgeFactory: ${factoryAddress}`);
  console.log(`AgentVault Implementation: ${vaultImplAddress}`);
  console.log('======================================================');
}

main().catch(err => {
  console.error('\nDeployment failed:', err);
  process.exit(1);
});
