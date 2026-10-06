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

async function main() {
  const privateKeyRaw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKeyRaw) {
    throw new Error('DEPLOYER_PRIVATE_KEY missing in .env');
  }
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : '0x' + privateKeyRaw;

  const wallet = new ethers.Wallet(privateKey);
  console.log('Deployer Address:', wallet.address);

  // Check Chain ID via RPC
  const chainIdHex = await rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log('BOT Chain ID:', chainId);
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Chain ID mismatch! Expected ${EXPECTED_CHAIN_ID}, got ${chainId}`);
  }

  // Check Balance
  const balanceHex = await rpcCall('eth_getBalance', [wallet.address, 'latest']);
  const balanceWei = BigInt(balanceHex);
  const balanceBot = ethers.formatEther(balanceWei);
  console.log('Deployer Balance (Wei):', balanceWei.toString());
  console.log('Deployer Balance (BOT):', balanceBot, 'BOT');

  // Check Nonce
  const nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Deployer Nonce:', nonce);

  // Check Gas Price
  const gasPriceHex = await rpcCall('eth_gasPrice');
  const gasPriceWei = BigInt(gasPriceHex);
  console.log('Gas Price (Gwei):', ethers.formatUnits(gasPriceWei, 'gwei'));
}

main().catch(console.error);
