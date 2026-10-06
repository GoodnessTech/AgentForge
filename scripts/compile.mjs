import fs from 'fs';
import path from 'path';
import solc from 'solc';

const contractsDir = path.resolve('contracts');
const artifactsDir = path.resolve('artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

const sources = {
  'AgentVault.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'AgentVault.sol'), 'utf8')
  },
  'AgentForgeFactory.sol': {
    content: fs.readFileSync(path.join(contractsDir, 'AgentForgeFactory.sol'), 'utf8')
  }
};

const mocksPath = path.resolve('test/contracts/TestMocks.sol');
if (fs.existsSync(mocksPath)) {
  sources['TestMocks.sol'] = {
    content: fs.readFileSync(mocksPath, 'utf8')
  };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    viaIR: true,
    evmVersion: 'paris',
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.gasEstimates']
      }
    }
  }
};

console.log('Compiling contracts with solc', solc.version(), '...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasError = false;
  for (const err of output.errors) {
    if (err.severity === 'error') {
      console.error('COMPILE ERROR:', err.formattedMessage);
      hasError = true;
    } else {
      console.warn('COMPILE WARNING:', err.formattedMessage);
    }
  }
  if (hasError) process.exit(1);
}

const compiledContracts = {};

for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, contract] of Object.entries(contracts)) {
    const bytecode = contract.evm.bytecode.object;
    const deployedBytecode = contract.evm.deployedBytecode.object;
    const size = Buffer.from(bytecode, 'hex').length;
    const deployedSize = Buffer.from(deployedBytecode, 'hex').length;

    console.log(`✓ ${name} compiled:`);
    console.log(`  Bytecode size: ${size} bytes`);
    console.log(`  Deployed runtime size: ${deployedSize} bytes`);

    const artifact = {
      contractName: name,
      abi: contract.abi,
      bytecode: '0x' + bytecode,
      deployedBytecode: '0x' + deployedBytecode
    };

    fs.writeFileSync(
      path.join(artifactsDir, `${name}.json`),
      JSON.stringify(artifact, null, 2)
    );
    compiledContracts[name] = artifact;
  }
}

console.log('Compilation succeeded! Artifacts written to artifacts/');
