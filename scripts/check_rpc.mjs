const RPC_URL = 'https://rpc.botchain.ai';

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
  console.log('Querying RPC:', RPC_URL);
  const chainIdHex = await rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log(`Chain ID: ${chainId} (hex: ${chainIdHex})`);

  const blockNumberHex = await rpcCall('eth_blockNumber');
  const blockNumber = parseInt(blockNumberHex, 16);
  console.log(`Latest Block: ${blockNumber}`);

  const gasPriceHex = await rpcCall('eth_gasPrice');
  const gasPriceGwei = (parseInt(gasPriceHex, 16) / 1e9).toFixed(4);
  console.log(`Gas Price: ${gasPriceHex} (~${gasPriceGwei} Gwei)`);
}

main().catch(console.error);
