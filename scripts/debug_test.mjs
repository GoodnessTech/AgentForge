import assert from 'node:assert/strict';
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
  const agentExecutor = await provider.getSigner(accounts[2]);
  const funder1 = await provider.getSigner(accounts[3]);
  const funder2 = await provider.getSigner(accounts[4]);
  const customer = await provider.getSigner(accounts[5]);
  const recipient = await provider.getSigner(accounts[6]);

  console.log('1. Deploying implementation and factory...');
  const vaultArtifact = loadArtifact('AgentVault');
  const VaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, deployer);
  const vaultImplementation = await VaultFactory.deploy();
  await vaultImplementation.waitForDeployment();

  const factoryArtifact = loadArtifact('AgentForgeFactory');
  const FactoryFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, deployer);
  const factory = await FactoryFactory.deploy(await vaultImplementation.getAddress());
  await factory.waitForDeployment();

  const mockTargetArtifact = loadArtifact('MockTarget');
  const MockTargetFactory = new ethers.ContractFactory(mockTargetArtifact.abi, mockTargetArtifact.bytecode, deployer);
  const mockTarget = await MockTargetFactory.deploy();
  await mockTarget.waitForDeployment();

  const rejectArtifact = loadArtifact('RejectEther');
  const RejectFactory = new ethers.ContractFactory(rejectArtifact.abi, rejectArtifact.bytecode, deployer);
  const rejectEther = await RejectFactory.deploy();
  await rejectEther.waitForDeployment();

  console.log('2. Testing Agent Creation...');
  const factoryAsCreator = factory.connect(creator);
  const mockTargetAddr = await mockTarget.getAddress();
  const agentExecAddr = await agentExecutor.getAddress();
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 86400 * 7;
  const expiry = now + 86400 * 30;

  const launchParams = {
    executionAddress: agentExecAddr,
    allowedTarget: mockTargetAddr,
    fundingTarget: ethers.parseEther('10'),
    fundingDeadline: BigInt(deadline),
    maxPerTx: ethers.parseEther('1'),
    dailyLimit: ethers.parseEther('3'),
    policyExpiry: BigInt(expiry)
  };

  const createTx = await factoryAsCreator.createAgent('Alpha Sentinel', 'ipfs://alpha', launchParams);
  await createTx.wait();
  console.log('Agent created! Total agents:', await factory.totalAgents());

  console.log('3. Fetching summary...');
  let summary = await factory.getAgentSummary(1);
  console.log('Summary name:', summary.name, 'vault:', summary.vault);

  console.log('4. Funding agent...');
  const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);
  await (await vault.fund({ value: ethers.parseEther('5') })).wait();
  console.log('Funded 5 BOT! Vault balance:', await provider.getBalance(summary.vault));

  console.log('5. Testing execution...');
  const vaultAsAgent = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);
  const calldata = mockTarget.interface.encodeFunctionData('performAction', [42]);
  await (await vaultAsAgent.execute(mockTargetAddr, ethers.parseEther('0.5'), calldata)).wait();
  console.log('Executed! Target balance:', await provider.getBalance(mockTargetAddr));

  console.log('6. Revenue...');
  const vaultAsCustomer = new ethers.Contract(summary.vault, vaultArtifact.abi, customer);
  await (await vaultAsCustomer.payRevenue({ value: ethers.parseEther('1') })).wait();
  console.log('Revenue paid!');

  console.log('7. Distribution...');
  const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);
  await (await vaultAsCreator.distribute(await recipient.getAddress(), ethers.parseEther('0.5'), 'payout')).wait();
  console.log('Distributed 0.5 BOT!');

  console.log('8. Pause & Unpause...');
  await (await vaultAsCreator.pause()).wait();
  console.log('Paused! isPaused:', await vaultAsCreator.isPaused());

  console.log('Fetching summary while paused...');
  try {
    summary = await factory.getAgentSummary(1);
    console.log('Summary while paused isPaused:', summary.isPaused);
  } catch (err) {
    console.error('FAILED fetching summary while paused:', err);
  }

  await (await vaultAsCreator.unpause()).wait();
  console.log('Unpaused! isPaused:', await vaultAsCreator.isPaused());

  console.log('9. Summary after unpause...');
  summary = await factory.getAgentSummary(1);
  console.log('Summary after unpause isPaused:', summary.isPaused);

  console.log('ALL DEBUG TESTS COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
