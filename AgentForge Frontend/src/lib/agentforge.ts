import { ethers } from 'ethers';
import contractsData from './contracts.json';

export type AgentStatus = 'draft' | 'funding' | 'operating' | 'revenue' | 'paused';

export interface AgentSummary {
  id: string;
  name: string;
  service: string;
  status: AgentStatus;
  address?: string;
  vault?: string;
  creator?: string;
  executionAddress?: string;
  fundingTarget?: string;
  currentFunding?: string;
  treasuryBalance?: string;
  totalRevenue?: string;
  totalDistributed?: string;
  maxPerTx?: string;
  dailyLimit?: string;
  isPaused?: boolean;
}

export interface WalletState {
  status: 'disconnected' | 'connecting' | 'connected' | 'wrong-network';
  address?: string;
  chainId?: number;
  balance?: string;
  error?: string;
}

export interface TransactionState {
  status: 'idle' | 'preparing' | 'signature' | 'submitted' | 'confirming' | 'success' | 'failed';
  hash?: string;
  error?: string;
  vaultAddress?: string;
}

export interface LaunchDraft {
  identity: { name: string; description: string; address: string };
  service: { description: string; customer: string; payment: string };
  treasury: { purpose: string; asset: string; destination: string };
  permissions: { targets: string; transactionTypes: string; maxValue: string; dailyLimit: string; expiry: string; emergencyPause: boolean };
  economics: { target: string; minimum: string; deadline: string; revenueModel: string; fee: string; allocation: string; distribution: string };
  policy: { transactionLimit: string; dailyLimit: string; contracts: string; assets: string; status: string; emergencyPause: boolean };
}

export const BOT_CHAIN = {
  name: 'BOT Chain Mainnet',
  chainId: 677,
  chainIdHex: '0x2a5',
  rpcUrl: 'https://rpc.botchain.ai',
  symbol: 'BOT',
  decimals: 18,
  explorerUrl: 'https://scan.botchain.ai'
} as const;

export const CONTRACT_CONFIG = {
  factoryAddress: (import.meta.env?.VITE_FACTORY_ADDRESS as string) || contractsData.factoryAddress,
  vaultImplementation: (import.meta.env?.VITE_VAULT_IMPLEMENTATION as string) || contractsData.vaultImplementation,
  factoryAbi: contractsData.factoryAbi,
  vaultAbi: contractsData.vaultAbi,
};

export const emptyLaunchDraft: LaunchDraft = {
  identity: { name: '', description: '', address: '' },
  service: { description: '', customer: '', payment: '' },
  treasury: { purpose: '', asset: 'BOT', destination: '' },
  permissions: { targets: '', transactionTypes: '', maxValue: '0.1', dailyLimit: '0.5', expiry: '', emergencyPause: true },
  economics: { target: '1.0', minimum: '0.001', deadline: '', revenueModel: 'Usage & Intelligence', fee: '5', allocation: '95', distribution: 'Pro-rata to funders' },
  policy: { transactionLimit: '0.1', dailyLimit: '0.5', contracts: '', assets: 'BOT', status: 'Active after launch', emergencyPause: true },
};

export function decodeName(raw: string): string {
  try {
    if (raw.startsWith('0x')) {
      return ethers.decodeBytes32String(raw).replace(/\0/g, '');
    }
    return raw;
  } catch {
    const clean = raw.replace(/^0x/, '');
    let str = '';
    for (let i = 0; i < clean.length; i += 2) {
      const code = parseInt(clean.substring(i, i + 2), 16);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    return str || raw;
  }
}

// Fallback JSON-RPC call using native fetch for reading state reliably
async function queryRpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(BOT_CHAIN.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export interface AgentForgeGateway {
  getAgents(): Promise<AgentSummary[]>;
  getAgentDetails(id: string): Promise<AgentSummary | null>;
  connectWallet(): Promise<WalletState>;
  switchNetwork(): Promise<boolean>;
  getWalletBalance(address: string): Promise<string>;
  launchAgent(draft: LaunchDraft): Promise<TransactionState>;
  fundAgent(vaultAddress: string, amount: string): Promise<TransactionState>;
  payRevenue(vaultAddress: string, amount: string): Promise<TransactionState>;
  distribute(vaultAddress: string, recipient: string, amount: string, memo: string): Promise<TransactionState>;
  togglePause(vaultAddress: string, isPaused: boolean): Promise<TransactionState>;
}

export class BotChainGateway implements AgentForgeGateway {
  private factoryInterface: ethers.Interface;
  private vaultInterface: ethers.Interface;

  constructor() {
    this.factoryInterface = new ethers.Interface(CONTRACT_CONFIG.factoryAbi);
    this.vaultInterface = new ethers.Interface(CONTRACT_CONFIG.vaultAbi);
  }

  async getAgents(): Promise<AgentSummary[]> {
    try {
      const totalHex = await queryRpc('eth_call', [{
        to: CONTRACT_CONFIG.factoryAddress,
        data: this.factoryInterface.encodeFunctionData('totalAgents')
      }, 'latest']);

      const [total] = this.factoryInterface.decodeFunctionResult('totalAgents', totalHex);
      const totalCount = Number(total);
      if (totalCount === 0) return [];

      const agents: AgentSummary[] = [];

      // Try batch summary first
      try {
        const summariesHex = await queryRpc('eth_call', [{
          to: CONTRACT_CONFIG.factoryAddress,
          data: this.factoryInterface.encodeFunctionData('getAllAgentSummaries')
        }, 'latest']);
        const [summaries] = this.factoryInterface.decodeFunctionResult('getAllAgentSummaries', summariesHex);

        for (const s of summaries) {
          agents.push(this.formatSummary(s));
        }
        return agents;
      } catch (e) {
        console.warn('Batch fetch failed, falling back to individual queries:', e);
      }

      // Fallback: Query individually
      for (let i = 1; i <= totalCount; i++) {
        const s = await this.getAgentDetails(i.toString());
        if (s) agents.push(s);
      }

      return agents;
    } catch (err) {
      console.error('Failed to get agents from BOT Chain:', err);
      return [];
    }
  }

  async getAgentDetails(id: string): Promise<AgentSummary | null> {
    try {
      const summaryHex = await queryRpc('eth_call', [{
        to: CONTRACT_CONFIG.factoryAddress,
        data: this.factoryInterface.encodeFunctionData('getAgentSummary', [BigInt(id)])
      }, 'latest']);

      const [s] = this.factoryInterface.decodeFunctionResult('getAgentSummary', summaryHex);
      return this.formatSummary(s);
    } catch (err) {
      console.error(`Failed to fetch agent ${id}:`, err);
      return null;
    }
  }

  private formatSummary(s: any): AgentSummary {
    const rawName = s.name || '';
    const name = decodeName(rawName) || `Agent #${s.id.toString()}`;
    const treasuryWei = BigInt(s.treasuryBalance || 0n);
    const fundedWei = BigInt(s.totalFunded || 0n);
    const targetWei = BigInt(s.fundingTarget || 0n);
    const revenueWei = BigInt(s.totalRevenue || 0n);
    const distributedWei = BigInt(s.totalDistributed || 0n);
    const isPaused = Boolean(s.isPaused);

    let status: AgentStatus = 'funding';
    if (isPaused) {
      status = 'paused';
    } else if (revenueWei > 0n) {
      status = 'revenue';
    } else if (treasuryWei > 0n || fundedWei >= targetWei) {
      status = 'operating';
    }

    return {
      id: s.id.toString(),
      name,
      service: 'Autonomous on-chain operations & intelligence',
      status,
      address: s.vault,
      vault: s.vault,
      creator: s.creator,
      executionAddress: s.executionAddress,
      fundingTarget: ethers.formatEther(targetWei),
      currentFunding: ethers.formatEther(fundedWei),
      treasuryBalance: ethers.formatEther(treasuryWei),
      totalRevenue: ethers.formatEther(revenueWei),
      totalDistributed: ethers.formatEther(distributedWei),
      maxPerTx: ethers.formatEther(BigInt(s.maxPerTx || 0n)),
      dailyLimit: ethers.formatEther(BigInt(s.dailyLimit || 0n)),
      isPaused
    };
  }

  async connectWallet(): Promise<WalletState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'disconnected', error: 'No Ethereum wallet found. Please install MetaMask, Rabby, or Coinbase Wallet.' };
    }

    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        return { status: 'disconnected', error: 'No accounts selected.' };
      }

      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);

      if (chainId !== BOT_CHAIN.chainId) {
        const switched = await this.switchNetwork();
        if (!switched) {
          return { status: 'wrong-network', address: accounts[0], chainId };
        }
      }

      const balance = await this.getWalletBalance(accounts[0]);
      return {
        status: 'connected',
        address: accounts[0],
        chainId: BOT_CHAIN.chainId,
        balance
      };
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      return { status: 'disconnected', error: err.message || 'Failed to connect wallet.' };
    }
  }

  async switchNetwork(): Promise<boolean> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return false;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BOT_CHAIN.chainIdHex }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BOT_CHAIN.chainIdHex,
              chainName: BOT_CHAIN.name,
              nativeCurrency: {
                name: 'BOT',
                symbol: BOT_CHAIN.symbol,
                decimals: BOT_CHAIN.decimals
              },
              rpcUrls: [BOT_CHAIN.rpcUrl],
              blockExplorerUrls: [BOT_CHAIN.explorerUrl]
            }],
          });
          return true;
        } catch (addError) {
          console.error('Failed to add BOT Chain:', addError);
          return false;
        }
      }
      return false;
    }
  }

  async getWalletBalance(address: string): Promise<string> {
    try {
      const balanceHex = await queryRpc('eth_getBalance', [address, 'latest']);
      return parseFloat(ethers.formatEther(balanceHex)).toFixed(4);
    } catch {
      return '0.0000';
    }
  }

  async launchAgent(draft: LaunchDraft): Promise<TransactionState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'failed', error: 'Wallet not detected' };
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const factory = new ethers.Contract(CONTRACT_CONFIG.factoryAddress, CONTRACT_CONFIG.factoryAbi, signer);

      const targetAddr = draft.permissions.targets && ethers.isAddress(draft.permissions.targets.trim())
        ? draft.permissions.targets.trim()
        : ethers.ZeroAddress;

      const execAddr = draft.identity.address && ethers.isAddress(draft.identity.address.trim())
        ? draft.identity.address.trim()
        : signerAddress;

      const targetVal = parseFloat(draft.economics.target || '1.0');
      const maxTxVal = parseFloat(draft.permissions.maxValue || draft.policy.transactionLimit || '0.1');
      const dailyVal = parseFloat(draft.permissions.dailyLimit || draft.policy.dailyLimit || '0.5');

      const launchParams = {
        executionAddress: execAddr,
        allowedTarget: targetAddr,
        fundingTarget: ethers.parseEther(targetVal.toString()),
        fundingDeadline: 0n,
        maxPerTx: ethers.parseEther(maxTxVal.toString()),
        dailyLimit: ethers.parseEther(dailyVal.toString()),
        policyExpiry: 0n
      };

      const metadataURI = `ipfs://agentforge/${encodeURIComponent(draft.identity.name || 'Agent')}`;

      const tx = await factory.createAgent(
        draft.identity.name.trim() || 'Autonomous Agent',
        metadataURI,
        launchParams
      );

      const receipt = await tx.wait();
      let createdVaultAddress = '';
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = factory.interface.parseLog(log);
            if (parsed && parsed.name === 'AgentCreated') {
              createdVaultAddress = parsed.args.vault;
              break;
            }
          } catch {}
        }
      }

      return {
        status: 'success',
        hash: tx.hash,
        vaultAddress: createdVaultAddress
      };
    } catch (err: any) {
      console.error('Launch agent error:', err);
      return {
        status: 'failed',
        error: err.reason || err.message || 'Transaction rejected'
      };
    }
  }

  async fundAgent(vaultAddress: string, amount: string): Promise<TransactionState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'failed', error: 'Wallet not detected' };
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const vault = new ethers.Contract(vaultAddress, CONTRACT_CONFIG.vaultAbi, signer);
      const value = ethers.parseEther(amount);

      const tx = await vault.fund({ value });
      await tx.wait();

      return {
        status: 'success',
        hash: tx.hash
      };
    } catch (err: any) {
      console.error('Funding error:', err);
      return {
        status: 'failed',
        error: err.reason || err.message || 'Funding transaction rejected'
      };
    }
  }

  async payRevenue(vaultAddress: string, amount: string): Promise<TransactionState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'failed', error: 'Wallet not detected' };
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const vault = new ethers.Contract(vaultAddress, CONTRACT_CONFIG.vaultAbi, signer);
      const value = ethers.parseEther(amount);

      const tx = await vault.payRevenue({ value });
      await tx.wait();

      return {
        status: 'success',
        hash: tx.hash
      };
    } catch (err: any) {
      console.error('Pay revenue error:', err);
      return {
        status: 'failed',
        error: err.reason || err.message || 'Revenue payment rejected'
      };
    }
  }

  async distribute(vaultAddress: string, recipient: string, amount: string, memo: string): Promise<TransactionState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'failed', error: 'Wallet not detected' };
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const vault = new ethers.Contract(vaultAddress, CONTRACT_CONFIG.vaultAbi, signer);
      const value = ethers.parseEther(amount);

      const tx = await vault.distribute(recipient, value, memo);
      await tx.wait();

      return {
        status: 'success',
        hash: tx.hash
      };
    } catch (err: any) {
      console.error('Distribute error:', err);
      return {
        status: 'failed',
        error: err.reason || err.message || 'Distribution rejected'
      };
    }
  }

  async togglePause(vaultAddress: string, isCurrentlyPaused: boolean): Promise<TransactionState> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return { status: 'failed', error: 'Wallet not detected' };
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const vault = new ethers.Contract(vaultAddress, CONTRACT_CONFIG.vaultAbi, signer);
      const tx = isCurrentlyPaused ? await vault.unpause() : await vault.pause();
      await tx.wait();

      return {
        status: 'success',
        hash: tx.hash
      };
    } catch (err: any) {
      console.error('Toggle pause error:', err);
      return {
        status: 'failed',
        error: err.reason || err.message || 'Pause transaction rejected'
      };
    }
  }
}

export const gateway = new BotChainGateway();
