import fs from 'fs';
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
  const privateKeyRaw = process.env.DEPLOYER_PRIVATE_KEY;
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : '0x' + privateKeyRaw;
  const wallet = new ethers.Wallet(privateKey);
  console.log('Funder Address:', wallet.address);

  const vaultAddress = '0x5e95F7169749d73Dfc4fab17AB2b60146d05eA3d';
  const vaultArtifact = JSON.parse(fs.readFileSync('artifacts/AgentVault.json', 'utf8'));
  const vault = new ethers.Contract(vaultAddress, vaultArtifact.abi);

  const fundAmount = ethers.parseEther('0.005');
  const txData = vault.interface.encodeFunctionData('fund');

  const gasPrice = BigInt(await rpcCall('eth_gasPrice'));
  let nonce = parseInt(await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']), 16);

  const estGas = BigInt(await rpcCall('eth_estimateGas', [{
    from: wallet.address,
    to: vaultAddress,
    data: txData,
    value: '0x' + fundAmount.toString(16)
  }]));
  const gasLimit = (estGas * 125n) / 100n;

  const fundTx = {
    to: vaultAddress,
    data: txData,
    value: fundAmount,
    nonce: nonce++,
    gasLimit,
    gasPrice,
    chainId: EXPECTED_CHAIN_ID
  };

  const signedTx = await wallet.signTransaction(fundTx);
  const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log('fund tx broadcasted:', txHash);

  const receipt = await waitForReceipt(txHash);
  if (receipt.status !== '0x1') {
    throw new Error('Funding failed');
  }
  console.log('✓ Nexus Sentinel successfully funded on BOT Chain Mainnet!');
  console.log('Vault Balance:', ethers.formatEther(await rpcCall('eth_getBalance', [vaultAddress, 'latest'])), 'BOT');
}

main().catch(console.error);
