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

async function main() {
  console.log('=== Launching Genesis Agent on BOT Chain Mainnet ===\n');

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
  const factoryAddress = deployment.factoryAddress;
  console.log('Using Factory Address:', factoryAddress);

  const privateKeyRaw = process.env.DEPLOYER_PRIVATE_KEY;
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : '0x' + privateKeyRaw;
  const wallet = new ethers.Wallet(privateKey);
  console.log('Deployer/Creator Address:', wallet.address);

  const gasPriceHex = await rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  let nonce = parseInt(await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']), 16);

  const factoryArtifact = JSON.parse(fs.readFileSync('artifacts/AgentForgeFactory.json', 'utf8'));
  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi);

  const launchParams = {
    executionAddress: wallet.address,
    allowedTarget: ethers.ZeroAddress,
    fundingTarget: ethers.parseEther('1.0'),
    fundingDeadline: 0n,
    maxPerTx: ethers.parseEther('0.1'),
    dailyLimit: ethers.parseEther('0.5'),
    policyExpiry: 0n
  };

  const name = 'Nexus Sentinel';
  const metadataURI = 'ipfs://bafybeinewgenesisagent01';

  const txData = factory.interface.encodeFunctionData('createAgent', [
    name,
    metadataURI,
    launchParams
  ]);

  const estGasHex = await rpcCall('eth_estimateGas', [{
    from: wallet.address,
    to: factoryAddress,
    data: txData
  }]);
  const gasLimit = (BigInt(estGasHex) * 125n) / 100n;
  console.log(`Estimated gas for createAgent: ${BigInt(estGasHex)} -> limit: ${gasLimit}`);

  const createTx = {
    to: factoryAddress,
    data: txData,
    nonce: nonce++,
    gasLimit,
    gasPrice,
    chainId: EXPECTED_CHAIN_ID,
    value: 0n
  };

  const signedTx = await wallet.signTransaction(createTx);
  const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log('createAgent tx broadcasted:', txHash);

  const receipt = await waitForReceipt(txHash);
  if (receipt.status !== '0x1') {
    throw new Error(`createAgent failed! Status: ${receipt.status}`);
  }
  console.log('✓ Agent launched on BOT Chain Mainnet!');
  console.log(`  Gas used: ${parseInt(receipt.gasUsed, 16)} (~${(parseInt(receipt.gasUsed, 16) * Number(gasPrice) / 1e18).toFixed(6)} BOT)\n`);

  // Query updated totalAgents and agent summary
  const totalAgentsHex = await rpcCall('eth_call', [{
    to: factoryAddress,
    data: factory.interface.encodeFunctionData('totalAgents')
  }, 'latest']);
  const [totalAgents] = factory.interface.decodeFunctionResult('totalAgents', totalAgentsHex);
  console.log(`Total Agents on-chain: ${totalAgents}`);

  const summaryHex = await rpcCall('eth_call', [{
    to: factoryAddress,
    data: factory.interface.encodeFunctionData('getAgentSummary', [totalAgents])
  }, 'latest']);
  const [summary] = factory.interface.decodeFunctionResult('getAgentSummary', summaryHex);

  console.log('\n--- Live Agent Details ---');
  console.log('Agent ID:', summary.id.toString());
  console.log('Vault Address:', summary.vault);
  console.log('Creator:', summary.creator);
  console.log('Execution Address:', summary.executionAddress);
  console.log('Name (bytes32):', summary.name);
  console.log('Decoded Name:', ethers.decodeBytes32String(summary.name));
  console.log('Funding Target:', ethers.formatEther(summary.fundingTarget), 'BOT');
  console.log('Treasury Balance:', ethers.formatEther(summary.treasuryBalance), 'BOT');
  console.log('Max Per Tx:', ethers.formatEther(summary.maxPerTx), 'BOT');
  console.log('Daily Limit:', ethers.formatEther(summary.dailyLimit), 'BOT');
}

main().catch(err => {
  console.error('Launch failed:', err);
  process.exit(1);
});
