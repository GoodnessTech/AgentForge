import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://rpc.botchain.ai';
const contracts = JSON.parse(fs.readFileSync('AgentForge Frontend/src/lib/contracts.json', 'utf8'));

async function queryRpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

function decodeName(raw) {
  try {
    if (raw.startsWith('0x')) {
      return ethers.decodeBytes32String(raw).replace(/\0/g, '');
    }
    return raw;
  } catch {
    return raw;
  }
}

async function main() {
  console.log('=== Testing Frontend Gateway BOT Chain Queries ===\n');

  const iface = new ethers.Interface(contracts.factoryAbi);
  const totalHex = await queryRpc('eth_call', [{
    to: contracts.factoryAddress,
    data: iface.encodeFunctionData('totalAgents')
  }, 'latest']);
  const [total] = iface.decodeFunctionResult('totalAgents', totalHex);
  console.log('Total Agents on Factory:', total.toString());

  const summariesHex = await queryRpc('eth_call', [{
    to: contracts.factoryAddress,
    data: iface.encodeFunctionData('getAllAgentSummaries')
  }, 'latest']);
  const [summaries] = iface.decodeFunctionResult('getAllAgentSummaries', summariesHex);

  console.log(`Retrieved ${summaries.length} summaries from mainnet:\n`);
  for (const s of summaries) {
    console.log({
      id: s.id.toString(),
      name: decodeName(s.name),
      vault: s.vault,
      creator: s.creator,
      executionAddress: s.executionAddress,
      fundingTarget: ethers.formatEther(s.fundingTarget) + ' BOT',
      currentFunding: ethers.formatEther(s.totalFunded) + ' BOT',
      treasuryBalance: ethers.formatEther(s.treasuryBalance) + ' BOT',
      maxPerTx: ethers.formatEther(s.maxPerTx) + ' BOT',
      dailyLimit: ethers.formatEther(s.dailyLimit) + ' BOT',
      isPaused: s.isPaused
    });
  }
}

main().catch(console.error);
