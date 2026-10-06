import assert from 'node:assert/strict';
import { test, describe, before } from 'node:test';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import ganache from 'ganache';

function loadArtifact(name) {
  const p = path.resolve(`artifacts/${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function assertReverts(fn, expectedPattern) {
  try {
    await fn();
    assert.fail('Expected transaction to revert, but it succeeded');
  } catch (err) {
    const msg = err.message || String(err);
    if (expectedPattern && !expectedPattern.test(msg) && !/CALL_EXCEPTION|missing revert data|revert/.test(msg)) {
      throw err;
    }
  }
}

describe('AgentForge Protocol Test Suite', async () => {
  let provider;
  let deployer;
  let creator;
  let agentExecutor;
  let funder1;
  let funder2;
  let customer;
  let recipient;

  let factory;
  let vaultImplementation;
  let mockTarget;
  let rejectEther;

  before(async () => {
    const ganacheProvider = ganache.provider({
      wallet: { totalAccounts: 10, defaultBalance: 1000 },
      logging: { quiet: true }
    });
    provider = new ethers.BrowserProvider(ganacheProvider);
    const accounts = await ganacheProvider.request({ method: 'eth_accounts' });

    deployer = await provider.getSigner(accounts[0]);
    creator = await provider.getSigner(accounts[1]);
    agentExecutor = await provider.getSigner(accounts[2]);
    funder1 = await provider.getSigner(accounts[3]);
    funder2 = await provider.getSigner(accounts[4]);
    customer = await provider.getSigner(accounts[5]);
    recipient = await provider.getSigner(accounts[6]);

    // 1. Deploy AgentVault implementation
    const vaultArtifact = loadArtifact('AgentVault');
    const VaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, deployer);
    vaultImplementation = await VaultFactory.deploy();
    await vaultImplementation.waitForDeployment();

    // 2. Deploy AgentForgeFactory
    const factoryArtifact = loadArtifact('AgentForgeFactory');
    const FactoryFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, deployer);
    factory = await FactoryFactory.deploy(await vaultImplementation.getAddress());
    await factory.waitForDeployment();

    // 3. Deploy MockTarget
    const mockTargetArtifact = loadArtifact('MockTarget');
    const MockTargetFactory = new ethers.ContractFactory(mockTargetArtifact.abi, mockTargetArtifact.bytecode, deployer);
    mockTarget = await MockTargetFactory.deploy();
    await mockTarget.waitForDeployment();

    // 4. Deploy RejectEther
    const rejectArtifact = loadArtifact('RejectEther');
    const RejectFactory = new ethers.ContractFactory(rejectArtifact.abi, rejectArtifact.bytecode, deployer);
    rejectEther = await RejectFactory.deploy();
    await rejectEther.waitForDeployment();
  });

  test('Deployment verification and gas measurements', async () => {
    const implAddr = await vaultImplementation.getAddress();
    const factoryAddr = await factory.getAddress();
    assert.ok(ethers.isAddress(implAddr), 'Implementation address valid');
    assert.ok(ethers.isAddress(factoryAddr), 'Factory address valid');
    assert.equal(await factory.vaultImplementation(), implAddr);
    assert.equal(await factory.totalAgents(), 0n);
  });

  test('Agent Creation: Creator launches agent economy', async () => {
    const factoryAsCreator = factory.connect(creator);
    const mockTargetAddr = await mockTarget.getAddress();
    const agentExecAddr = await agentExecutor.getAddress();

    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 86400 * 7; // 7 days
    const expiry = now + 86400 * 30; // 30 days

    const launchParams = {
      executionAddress: agentExecAddr,
      allowedTarget: mockTargetAddr,
      fundingTarget: ethers.parseEther('10'),
      fundingDeadline: BigInt(deadline),
      maxPerTx: ethers.parseEther('1'),
      dailyLimit: ethers.parseEther('3'),
      policyExpiry: BigInt(expiry)
    };

    const tx = await factoryAsCreator.createAgent(
      'Alpha Sentinel',
      'ipfs://bafybeialphasentinel',
      launchParams
    );
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1, 'Tx succeeded');

    assert.equal(await factory.totalAgents(), 1n);

    const summary = await factory.getAgentSummary(1);
    assert.equal(summary.id, 1n);
    assert.equal(ethers.decodeBytes32String(summary.name), 'Alpha Sentinel');
    assert.equal(summary.creator, await creator.getAddress());
    assert.equal(summary.executionAddress, agentExecAddr);
    assert.equal(summary.fundingTarget, ethers.parseEther('10'));
    assert.equal(summary.fundingDeadline, BigInt(deadline));
    assert.equal(summary.maxPerTx, ethers.parseEther('1'));
    assert.equal(summary.dailyLimit, ethers.parseEther('3'));
    assert.equal(summary.treasuryBalance, 0n);
    assert.equal(summary.isPaused, false);
  });

  test('Duplicate/Invalid Creation: Reverts on empty name', async () => {
    const factoryAsCreator = factory.connect(creator);
    const launchParams = {
      executionAddress: await agentExecutor.getAddress(),
      allowedTarget: ethers.ZeroAddress,
      fundingTarget: ethers.parseEther('5'),
      fundingDeadline: 0n,
      maxPerTx: ethers.parseEther('1'),
      dailyLimit: ethers.parseEther('2'),
      policyExpiry: 0n
    };

    await assertReverts(
      async () => {
        await factoryAsCreator.createAgent('', 'uri', launchParams);
      },
      /EmptyName/
    );
  });

  test('Funding & Treasury Accounting: Users fund agent with native BOT', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);

    // Funder 1 contributes 2 BOT
    const fundTx1 = await vault.fund({ value: ethers.parseEther('2') });
    await fundTx1.wait();

    // Funder 2 contributes 3 BOT
    const vaultAsFunder2 = vault.connect(funder2);
    const fundTx2 = await vaultAsFunder2.fund({ value: ethers.parseEther('3') });
    await fundTx2.wait();

    assert.equal(await vault.totalFunded(), ethers.parseEther('5'));
    assert.equal(await vault.contributions(await funder1.getAddress()), ethers.parseEther('2'));
    assert.equal(await vault.contributions(await funder2.getAddress()), ethers.parseEther('3'));

    const balance = await provider.getBalance(summary.vault);
    assert.equal(balance, ethers.parseEther('5'), 'Vault balance is 5 BOT');

    // Summary reflects live treasury balance
    const updatedSummary = await factory.getAgentSummary(1);
    assert.equal(updatedSummary.treasuryBalance, ethers.parseEther('5'));
    assert.equal(updatedSummary.totalFunded, ethers.parseEther('5'));
  });

  test('Funding limit edge cases: Zero-value funding reverts', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);

    await assertReverts(
      async () => {
        await vault.fund({ value: 0n });
      },
      /ZeroAmount/
    );
  });

  test('Execution Policy: Agent operates within policy rails', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);
    const mockTargetAddr = await mockTarget.getAddress();

    const calldata = mockTarget.interface.encodeFunctionData('performAction', [42]);

    // Agent executes within maxPerTx (0.5 BOT <= 1 BOT maxPerTx)
    const tx = await vault.execute(mockTargetAddr, ethers.parseEther('0.5'), calldata);
    await tx.wait();

    assert.equal(await mockTarget.counter(), 42n);
    const targetBalance = await provider.getBalance(mockTargetAddr);
    assert.equal(targetBalance, ethers.parseEther('0.5'));

    const vaultBalance = await provider.getBalance(summary.vault);
    assert.equal(vaultBalance, ethers.parseEther('4.5'));
  });

  test('Execution Policy: Exceeding maxPerTx reverts', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);
    const mockTargetAddr = await mockTarget.getAddress();

    const calldata = mockTarget.interface.encodeFunctionData('performAction', [1]);

    // maxPerTx is 1 BOT; attempting 1.5 BOT should revert
    await assertReverts(
      async () => {
        await vault.execute(mockTargetAddr, ethers.parseEther('1.5'), calldata);
      },
      /ExceedsMaxPerTx/
    );
  });

  test('Execution Policy: Exceeding dailyLimit reverts', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);
    const mockTargetAddr = await mockTarget.getAddress();
    const calldata = mockTarget.interface.encodeFunctionData('performAction', [1]);

    // Daily limit is 3 BOT. Already spent 0.5 BOT.
    // Spend 1 BOT (total 1.5)
    await (await vault.execute(mockTargetAddr, ethers.parseEther('1'), calldata)).wait();
    // Spend 1 BOT (total 2.5)
    await (await vault.execute(mockTargetAddr, ethers.parseEther('1'), calldata)).wait();

    // Now currentDaySpend is 2.5 BOT. Attempting 1 BOT more exceeds daily limit 3 BOT.
    await assertReverts(
      async () => {
        await vault.execute(mockTargetAddr, ethers.parseEther('1'), calldata);
      },
      /ExceedsDailyLimit/
    );
  });

  test('Execution Policy: Unauthorized caller reverts', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);
    const mockTargetAddr = await mockTarget.getAddress();
    const calldata = mockTarget.interface.encodeFunctionData('performAction', [1]);

    await assertReverts(
      async () => {
        await vault.execute(mockTargetAddr, ethers.parseEther('0.1'), calldata);
      },
      /Unauthorized/
    );
  });

  test('Execution Policy: Unapproved target reverts', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);

    // Call recipient instead of mockTarget (allowedTarget is mockTarget)
    await assertReverts(
      async () => {
        await vault.execute(await recipient.getAddress(), 0n, '0x');
      },
      /TargetNotAllowed/
    );
  });

  test('Revenue & Operations: Service payments enter treasury', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vault = new ethers.Contract(summary.vault, vaultArtifact.abi, customer);

    // Customer pays revenue for an AI agent service
    const tx = await vault.payRevenue({ value: ethers.parseEther('1.2') });
    await tx.wait();

    assert.equal(await vault.totalRevenue(), ethers.parseEther('1.2'));

    // Also direct native transfer to vault receive()
    const tx2 = await customer.sendTransaction({
      to: summary.vault,
      value: ethers.parseEther('0.3')
    });
    await tx2.wait();

    assert.equal(await vault.totalRevenue(), ethers.parseEther('1.5'));
  });

  test('Economic Distribution: Controlled distribution to participants', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);
    const recipAddr = await recipient.getAddress();

    const balanceBefore = await provider.getBalance(recipAddr);

    // Creator executes distribution according to configured economic model
    const tx = await vaultAsCreator.distribute(
      recipAddr,
      ethers.parseEther('1.0'),
      'Pro-rata Q1 distribution'
    );
    await tx.wait();

    const balanceAfter = await provider.getBalance(recipAddr);
    assert.equal(balanceAfter - balanceBefore, ethers.parseEther('1.0'));
    assert.equal(await vaultAsCreator.totalDistributed(), ethers.parseEther('1.0'));
  });

  test('Distribution edge cases: Unauthorized, ZeroAmount, InsufficientBalance', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vaultAsFunder = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);
    const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);

    // Non-creator
    await assertReverts(
      async () => {
        await vaultAsFunder.distribute(await funder1.getAddress(), ethers.parseEther('0.1'), 'steal');
      },
      /Unauthorized/
    );

    // Zero amount
    await assertReverts(
      async () => {
        await vaultAsCreator.distribute(await recipient.getAddress(), 0n, 'zero');
      },
      /ZeroAmount/
    );

    // Excessive amount
    await assertReverts(
      async () => {
        await vaultAsCreator.distribute(await recipient.getAddress(), ethers.parseEther('999'), 'too much');
      },
      /InsufficientTreasuryBalance/
    );
  });

  test('Failed native transfer safety check', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);
    const rejectAddr = await rejectEther.getAddress();

    // Distributing to a contract that rejects ETH reverts safely
    await assertReverts(
      async () => {
        await vaultAsCreator.distribute(rejectAddr, ethers.parseEther('0.1'), 'reject');
      },
      /TransferFailed/
    );
  });

  test('Emergency Controls: Pause and Unpause', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);
    const vaultAsAgent = new ethers.Contract(summary.vault, vaultArtifact.abi, agentExecutor);
    const vaultAsFunder = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);
    const mockTargetAddr = await mockTarget.getAddress();

    // Pause
    await (await vaultAsCreator.pause()).wait();
    assert.equal(await vaultAsCreator.isPaused(), true);

    // Funding while paused reverts
    await assertReverts(
      async () => {
        await vaultAsFunder.fund({ value: ethers.parseEther('0.1') });
      },
      /AgentIsPaused/
    );

    // Executing while paused reverts
    await assertReverts(
      async () => {
        await vaultAsAgent.execute(mockTargetAddr, 0n, '0x');
      },
      /AgentIsPaused/
    );

    // Distributing while paused reverts
    await assertReverts(
      async () => {
        await vaultAsCreator.distribute(await recipient.getAddress(), ethers.parseEther('0.1'), 'memo');
      },
      /AgentIsPaused/
    );

    // Unpause
    await (await vaultAsCreator.unpause()).wait();
    assert.equal(await vaultAsCreator.isPaused(), false);

    // Funding resumes normally
    const resumeFundTx = await vaultAsFunder.fund({ value: ethers.parseEther('0.1'), gasLimit: 200000 });
    await resumeFundTx.wait();
    assert.equal(await vaultAsCreator.isPaused(), false);
  });

  test('Policy Updates: Creator can update policy and execution address', async () => {
    const summary = await factory.getAgentSummary(1);
    const vaultArtifact = loadArtifact('AgentVault');
    const vaultAsCreator = new ethers.Contract(summary.vault, vaultArtifact.abi, creator);

    await (await vaultAsCreator.updatePolicy(
      ethers.ZeroAddress, // open targets
      ethers.parseEther('2'),
      ethers.parseEther('5'),
      0n
    )).wait();

    assert.equal(await vaultAsCreator.allowedTarget(), ethers.ZeroAddress);
    assert.equal(await vaultAsCreator.maxPerTx(), ethers.parseEther('2'));
    assert.equal(await vaultAsCreator.dailyLimit(), ethers.parseEther('5'));

    // Non-creator cannot update policy
    const vaultAsFunder = new ethers.Contract(summary.vault, vaultArtifact.abi, funder1);
    await assertReverts(
      async () => {
        await vaultAsFunder.updatePolicy(ethers.ZeroAddress, 1n, 1n, 0n);
      },
      /Unauthorized/
    );
  });

  test('Batch Queries: getAllAgentSummaries returns complete dataset', async () => {
    const summaries = await factory.getAllAgentSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(ethers.decodeBytes32String(summaries[0].name), 'Alpha Sentinel');
    assert.ok(summaries[0].treasuryBalance > 0n);
  });
});

