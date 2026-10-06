import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import ganache from 'ganache';

function loadArtifact(name) {
  const p = path.resolve(`artifacts/${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const ganacheProvider = ganache.provider({
    wallet: { totalAccounts: 10, defaultBalance: 1000 },
    logging: { quiet: true }
  });
  const provider = new ethers.BrowserProvider(ganacheProvider);
  const accounts = await ganacheProvider.request({ method: 'eth_accounts' });
  const deployer = await provider.getSigner(accounts[0]);
  const creator = await provider.getSigner(accounts[1]);
  const funder1 = await provider.getSigner(accounts[3]);

  const vaultArtifact = loadArtifact('AgentVault');
  const VaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, deployer);
  const vaultImplementation = await VaultFactory.deploy();
  await vaultImplementation.waitForDeployment();
  const implAddr = await vaultImplementation.getAddress();

  const factoryArtifact = loadArtifact('AgentForgeFactory');
  const FactoryFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, deployer);
  const factory = await FactoryFactory.deploy(implAddr);
  await factory.waitForDeployment();

  const launchParams = {
    executionAddress: accounts[2],
    allowedTarget: ethers.ZeroAddress,
    fundingTarget: ethers.parseEther('10'),
    fundingDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    maxPerTx: ethers.parseEther('1'),
    dailyLimit: ethers.parseEther('3'),
    policyExpiry: 0n
  };

  const createTx = await factory.connect(creator).createAgent('Alpha', 'uri', launchParams);
  await createTx.wait();

  const vaultAddr = await factory.getAgentVault(1);
  const v = new ethers.Contract(vaultAddr, vaultArtifact.abi, creator);
  const vFunder = new ethers.Contract(vaultAddr, vaultArtifact.abi, funder1);

  console.log('Pausing...');
  await (await v.pause()).wait();
  console.log('isPaused:', await v.isPaused());

  console.log('Unpausing...');
  await (await v.unpause()).wait();
  console.log('isPaused:', await v.isPaused());

  console.log('Testing fund after unpause...');
  try {
    const tx = await vFunder.fund({ value: ethers.parseEther('0.1') });
    await tx.wait();
    console.log('Fund succeeded! Vault balance:', await provider.getBalance(vaultAddr));
  } catch (err) {
    console.error('Fund failed:', err);
  }
}

main().catch(console.error);
