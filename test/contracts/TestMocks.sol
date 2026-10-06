// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

contract MockTarget {
    uint256 public counter;
    bytes public lastData;
    event Executed(address sender, uint256 value, bytes data);

    function performAction(uint256 amount) external payable returns (uint256) {
        counter += amount;
        emit Executed(msg.sender, msg.value, msg.data);
        return counter;
    }

    function failingAction() external pure {
        revert("Target action failed");
    }

    receive() external payable {}
}

contract ReentrantAttacker {
    AgentVault public targetVault;
    bool public hasAttacked;

    constructor(address payable _vault) {
        targetVault = AgentVault(_vault);
    }

    function attack() external payable {
        targetVault.fund{value: msg.value}();
    }

    receive() external payable {
        if (!hasAttacked) {
            hasAttacked = true;
            targetVault.fund{value: 1 wei}();
        }
    }
}

contract RejectEther {
    // Has no receive() or fallback(), rejects any native BOT transfer
}
