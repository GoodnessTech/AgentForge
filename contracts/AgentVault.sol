// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentVault
 * @notice Isolated treasury and execution policy vault for an AI agent on BOT Chain.
 * Follows the BOTSpend security philosophy: autonomous agents operate under narrow,
 * contract-enforced policy limits. No unrestricted treasury access.
 */
contract AgentVault {
    // Custom errors for gas efficiency
    error Unauthorized();
    error AgentIsPaused();
    error PolicyExpired();
    error TargetNotAllowed();
    error ExceedsMaxPerTx();
    error ExceedsDailyLimit();
    error FundingDeadlinePassed();
    error ZeroAmount();
    error ExecutionFailed();
    error TransferFailed();
    error AlreadyInitialized();
    error ReentrancyGuardReentrantCall();
    error InsufficientTreasuryBalance();

    struct LaunchParams {
        address executionAddress;
        address allowedTarget;
        uint256 fundingTarget;
        uint48 fundingDeadline;
        uint256 maxPerTx;
        uint256 dailyLimit;
        uint48 policyExpiry;
    }

    // Events
    event Initialized(address indexed factory, address indexed creator, address indexed executionAddress);
    event FundingReceived(address indexed contributor, uint256 amount, uint256 totalFunded);
    event RevenueReceived(address indexed source, uint256 amount, uint256 totalRevenue);
    event AgentExecuted(address indexed target, uint256 value, bytes data);
    event ExecutionPolicyUpdated(address allowedTarget, uint256 maxPerTx, uint256 dailyLimit, uint48 expiry);
    event AgentPaused(address indexed by);
    event AgentUnpaused(address indexed by);
    event DistributionExecuted(address indexed recipient, uint256 amount, string memo);
    event ExecutionAddressUpdated(address indexed oldAddress, address indexed newAddress);

    // Storage layout (packed where possible)
    address public factory;
    address public creator;
    address public executionAddress;
    address public allowedTarget; // address(0) allows any approved target within limits
    
    uint48 public fundingDeadline;
    uint48 public policyExpiry;
    uint48 public lastSpendTimestamp;
    bool public isPaused;
    bool public initialized;
    
    uint8 private _locked; // 1 = unlocked, 2 = locked

    uint256 public fundingTarget;
    uint256 public totalFunded;
    uint256 public totalRevenue;
    uint256 public totalDistributed;
    
    uint256 public maxPerTx;
    uint256 public dailyLimit;
    uint256 public currentDaySpend;

    mapping(address => uint256) public contributions;

    modifier onlyCreator() {
        if (msg.sender != creator) revert Unauthorized();
        _;
    }

    modifier onlyAgentOrCreator() {
        if (msg.sender != executionAddress && msg.sender != creator) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (isPaused) revert AgentIsPaused();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert ReentrancyGuardReentrantCall();
        _locked = 2;
        _;
        _locked = 1;
    }

    /**
     * @notice Initialize the clone vault. Can only be called once.
     */
    function initialize(
        address _factory,
        address _creator,
        LaunchParams calldata params
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        _locked = 1;

        factory = _factory;
        creator = _creator;
        executionAddress = params.executionAddress;
        allowedTarget = params.allowedTarget;
        
        fundingTarget = params.fundingTarget;
        fundingDeadline = params.fundingDeadline;
        
        maxPerTx = params.maxPerTx;
        dailyLimit = params.dailyLimit;
        policyExpiry = params.policyExpiry;

        emit Initialized(_factory, _creator, params.executionAddress);
        emit ExecutionPolicyUpdated(params.allowedTarget, params.maxPerTx, params.dailyLimit, params.policyExpiry);
    }

    /**
     * @notice Fund the agent with native BOT.
     */
    function fund() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        if (fundingDeadline > 0 && block.timestamp > fundingDeadline) revert FundingDeadlinePassed();

        totalFunded += msg.value;
        contributions[msg.sender] += msg.value;

        emit FundingReceived(msg.sender, msg.value, totalFunded);
    }

    /**
     * @notice Pay revenue for an agent service.
     */
    function payRevenue() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        totalRevenue += msg.value;

        emit RevenueReceived(msg.sender, msg.value, totalRevenue);
    }

    /**
     * @notice Executes an on-chain action within strict policy rails.
     * Can only be triggered by the agent execution address (or creator).
     * Enforces target whitelist, max value per tx, and daily limits.
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyAgentOrCreator whenNotPaused nonReentrant returns (bytes memory) {
        if (policyExpiry > 0 && block.timestamp > policyExpiry) revert PolicyExpired();
        if (allowedTarget != address(0) && target != allowedTarget) revert TargetNotAllowed();
        if (value > maxPerTx) revert ExceedsMaxPerTx();
        if (value > address(this).balance) revert InsufficientTreasuryBalance();

        // Daily limit check & rolling window
        if (dailyLimit > 0) {
            if (block.timestamp >= lastSpendTimestamp + 1 days) {
                currentDaySpend = 0;
            }
            if (currentDaySpend + value > dailyLimit) revert ExceedsDailyLimit();
            currentDaySpend += value;
            lastSpendTimestamp = uint48(block.timestamp);
        }

        // Execute call
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit AgentExecuted(target, value, data);
        return returnData;
    }

    /**
     * @notice Controlled distribution of treasury funds according to economic rules.
     * Only callable by creator.
     */
    function distribute(
        address payable recipient,
        uint256 amount,
        string calldata memo
    ) external onlyCreator whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) revert InsufficientTreasuryBalance();

        totalDistributed += amount;

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit DistributionExecuted(recipient, amount, memo);
    }

    /**
     * @notice Emergency pause preventing execution, funding, and distributions.
     */
    function pause() external onlyCreator {
        isPaused = true;
        emit AgentPaused(msg.sender);
    }

    /**
     * @notice Unpause the agent vault.
     */
    function unpause() external onlyCreator {
        isPaused = false;
        emit AgentUnpaused(msg.sender);
    }

    /**
     * @notice Update execution policy rails.
     */
    function updatePolicy(
        address _allowedTarget,
        uint256 _maxPerTx,
        uint256 _dailyLimit,
        uint48 _policyExpiry
    ) external onlyCreator {
        allowedTarget = _allowedTarget;
        maxPerTx = _maxPerTx;
        dailyLimit = _dailyLimit;
        policyExpiry = _policyExpiry;

        emit ExecutionPolicyUpdated(_allowedTarget, _maxPerTx, _dailyLimit, _policyExpiry);
    }

    /**
     * @notice Update the autonomous agent execution address.
     */
    function updateExecutionAddress(address _newExecutionAddress) external onlyCreator {
        address old = executionAddress;
        executionAddress = _newExecutionAddress;
        emit ExecutionAddressUpdated(old, _newExecutionAddress);
    }

    /**
     * @notice Fallback to accept native BOT as revenue.
     */
    receive() external payable {
        if (msg.value > 0) {
            totalRevenue += msg.value;
            emit RevenueReceived(msg.sender, msg.value, totalRevenue);
        }
    }
}
