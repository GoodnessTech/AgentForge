// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

/**
 * @title AgentForgeFactory
 * @notice Factory and registry for autonomous AI agent economies on BOT Chain.
 * Deploys lightweight AgentVault clones via ERC-1167 and maintains on-chain agent identity.
 * Highly gas-optimized: uses compact bytes32 identifiers and emits rich events.
 */
contract AgentForgeFactory {
    // Custom errors
    error InvalidImplementation();
    error AgentNotFound();
    error EmptyName();
    error CloneFailed();

    // Events
    event AgentCreated(
        uint256 indexed agentId,
        address indexed vault,
        address indexed creator,
        address executionAddress,
        string name,
        string metadataURI
    );

    struct AgentRecord {
        uint256 id;
        address vault;
        address creator;
        address executionAddress;
        bytes32 name;
        uint48 createdAt;
    }

    struct AgentSummary {
        uint256 id;
        address vault;
        address creator;
        address executionAddress;
        bytes32 name;
        uint48 createdAt;
        uint256 treasuryBalance;
        uint256 totalFunded;
        uint256 fundingTarget;
        uint48 fundingDeadline;
        uint256 totalRevenue;
        uint256 totalDistributed;
        uint256 maxPerTx;
        uint256 dailyLimit;
        bool isPaused;
    }

    address public immutable vaultImplementation;
    uint256 public totalAgents;
    
    mapping(uint256 => AgentRecord) private _agents;
    mapping(address => uint256[]) private _creatorAgents;
    address[] public allVaults;

    constructor(address _vaultImplementation) {
        if (_vaultImplementation == address(0)) revert InvalidImplementation();
        vaultImplementation = _vaultImplementation;
    }

    /**
     * @notice Launch a new AI Agent economy with isolated treasury and policy rails.
     */
    function createAgent(
        string calldata name,
        string calldata metadataURI,
        AgentVault.LaunchParams calldata params
    ) external returns (uint256 agentId, address vault) {
        if (bytes(name).length == 0) revert EmptyName();

        // Convert string to bytes32 for packed storage
        bytes32 nameBytes;
        assembly {
            nameBytes := calldataload(name.offset)
        }

        // Deploy ERC-1167 minimal proxy clone
        vault = _clone(vaultImplementation);

        // Initialize clone
        AgentVault(payable(vault)).initialize(
            address(this),
            msg.sender,
            params
        );

        totalAgents++;
        agentId = totalAgents;

        AgentRecord storage record = _agents[agentId];
        record.id = agentId;
        record.vault = vault;
        record.creator = msg.sender;
        record.executionAddress = params.executionAddress;
        record.name = nameBytes;
        record.createdAt = uint48(block.timestamp);

        _creatorAgents[msg.sender].push(agentId);
        allVaults.push(vault);

        emit AgentCreated(agentId, vault, msg.sender, params.executionAddress, name, metadataURI);
    }

    /**
     * @notice Get basic agent record by ID.
     */
    function getAgent(uint256 agentId) external view returns (AgentRecord memory) {
        if (agentId == 0 || agentId > totalAgents) revert AgentNotFound();
        return _agents[agentId];
    }

    /**
     * @notice Get agent vault address by ID.
     */
    function getAgentVault(uint256 agentId) external view returns (address) {
        if (agentId == 0 || agentId > totalAgents) revert AgentNotFound();
        return _agents[agentId].vault;
    }

    /**
     * @notice Get agent IDs created by a specific creator.
     */
    function getCreatorAgents(address creator) external view returns (uint256[] memory) {
        return _creatorAgents[creator];
    }

    /**
     * @notice Comprehensive single-RPC summary of an agent and its live vault state.
     */
    function getAgentSummary(uint256 agentId) public view returns (AgentSummary memory summary) {
        if (agentId == 0 || agentId > totalAgents) revert AgentNotFound();
        AgentRecord storage r = _agents[agentId];
        AgentVault v = AgentVault(payable(r.vault));

        summary.id = r.id;
        summary.vault = r.vault;
        summary.creator = r.creator;
        summary.executionAddress = r.executionAddress;
        summary.name = r.name;
        summary.createdAt = r.createdAt;
        summary.treasuryBalance = r.vault.balance;
        summary.totalFunded = v.totalFunded();
        summary.fundingTarget = v.fundingTarget();
        summary.fundingDeadline = v.fundingDeadline();
        summary.totalRevenue = v.totalRevenue();
        summary.totalDistributed = v.totalDistributed();
        summary.maxPerTx = v.maxPerTx();
        summary.dailyLimit = v.dailyLimit();
        summary.isPaused = v.isPaused();
    }

    /**
     * @notice Batch fetch all agent summaries in a single call.
     */
    function getAllAgentSummaries() external view returns (AgentSummary[] memory summaries) {
        uint256 count = totalAgents;
        summaries = new AgentSummary[](count);
        for (uint256 i = 0; i < count; i++) {
            summaries[i] = getAgentSummary(i + 1);
        }
    }

    /**
     * @dev Deploys and returns the address of an ERC-1167 clone of `implementation`.
     */
    function _clone(address implementation) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
