// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Milekeep
/// @notice Goal or date based BOT savings vaults. Early exits reward active savers.
contract Milekeep {
    uint256 public constant BPS = 10_000;
    uint256 public constant EARLY_EXIT_BPS = 1_000;
    uint256 public constant ACC_PRECISION = 1e24;
    uint64 public constant MAX_LOCK = 3650 days;

    struct Vault {
        address owner;
        uint64 unlockAt;
        bool closed;
        bool exitedEarly;
        uint256 goal;
        uint256 principal;
        uint256 storedReward;
        uint256 rewardDebt;
        string label;
    }

    mapping(uint256 => Vault) private _vaults;
    mapping(address => uint256[]) private _ownerVaults;

    uint256 public vaultCount;
    uint256 public activeVaultCount;
    uint256 public totalLocked;
    uint256 public totalRewardPaid;
    uint256 public totalPenaltyShared;
    uint256 public accRewardPerShare;
    uint256 public unallocatedRewards;
    uint256 private _entered = 1;

    event VaultOpened(uint256 indexed vaultId, address indexed owner, uint64 unlockAt, uint256 goal, uint256 amount, string label);
    event Added(uint256 indexed vaultId, address indexed contributor, uint256 amount);
    event VaultWithdrawn(uint256 indexed vaultId, address indexed owner, uint256 principal, uint256 reward);
    event VaultExitedEarly(uint256 indexed vaultId, address indexed owner, uint256 returnedAmount, uint256 redistributed);

    modifier nonReentrant() {
        require(_entered == 1, "reentrancy");
        _entered = 2;
        _;
        _entered = 1;
    }

    receive() external payable { revert("use a function"); }

    function openVault(string calldata label, uint64 unlockAt, uint256 goal) external payable nonReentrant returns (uint256 vaultId) {
        require(bytes(label).length > 0 && bytes(label).length <= 48, "bad label");
        require(msg.value > 0, "no value");
        require(unlockAt > block.timestamp && unlockAt <= block.timestamp + MAX_LOCK, "bad date");
        require(goal == 0 || goal >= msg.value, "bad goal");

        vaultId = ++vaultCount;
        Vault storage v = _vaults[vaultId];
        v.owner = msg.sender;
        v.unlockAt = unlockAt;
        v.goal = goal;
        v.principal = msg.value;
        v.label = label;
        _activateUnallocated();
        _ownerVaults[msg.sender].push(vaultId);
        totalLocked += msg.value;
        activeVaultCount += 1;
        v.rewardDebt = (v.principal * accRewardPerShare) / ACC_PRECISION;

        emit VaultOpened(vaultId, msg.sender, unlockAt, goal, msg.value, label);
    }

    function addToVault(uint256 vaultId) external payable nonReentrant {
        require(msg.value > 0, "no value");
        Vault storage v = _vaults[vaultId];
        require(v.owner != address(0), "no vault");
        require(!v.closed, "closed");

        _settle(v);
        v.principal += msg.value;
        totalLocked += msg.value;
        v.rewardDebt = (v.principal * accRewardPerShare) / ACC_PRECISION;
        emit Added(vaultId, msg.sender, msg.value);
    }

    function withdraw(uint256 vaultId) external nonReentrant {
        Vault storage v = _vaults[vaultId];
        require(v.owner == msg.sender, "owner only");
        require(!v.closed, "closed");
        require(_isUnlocked(v), "still locked");

        _settle(v);
        uint256 principal = v.principal;
        uint256 reward = v.storedReward;
        v.closed = true;
        v.principal = 0;
        v.storedReward = 0;
        v.rewardDebt = 0;
        totalLocked -= principal;
        activeVaultCount -= 1;
        totalRewardPaid += reward;

        _pay(msg.sender, principal + reward);
        emit VaultWithdrawn(vaultId, msg.sender, principal, reward);
    }

    function exitEarly(uint256 vaultId) external nonReentrant {
        Vault storage v = _vaults[vaultId];
        require(v.owner == msg.sender, "owner only");
        require(!v.closed, "closed");
        require(!_isUnlocked(v), "already unlocked");

        _settle(v);
        uint256 principal = v.principal;
        uint256 penalty = (principal * EARLY_EXIT_BPS) / BPS;
        uint256 returnedAmount = principal - penalty;
        uint256 redistribution = penalty + v.storedReward;

        v.closed = true;
        v.exitedEarly = true;
        v.principal = 0;
        v.storedReward = 0;
        v.rewardDebt = 0;
        totalLocked -= principal;
        activeVaultCount -= 1;

        if (totalLocked == 0) {
            unallocatedRewards += redistribution;
        } else {
            accRewardPerShare += (redistribution * ACC_PRECISION) / totalLocked;
            totalPenaltyShared += redistribution;
        }

        _pay(msg.sender, returnedAmount);
        emit VaultExitedEarly(vaultId, msg.sender, returnedAmount, redistribution);
    }

    function vault(uint256 vaultId) external view returns (Vault memory data, uint256 pendingReward, bool unlocked) {
        data = _vaults[vaultId];
        require(data.owner != address(0), "no vault");
        pendingReward = data.storedReward;
        if (!data.closed) {
            uint256 accumulated = (data.principal * accRewardPerShare) / ACC_PRECISION;
            if (accumulated > data.rewardDebt) pendingReward += accumulated - data.rewardDebt;
        }
        unlocked = _isUnlocked(data);
    }

    function vaultsOf(address owner) external view returns (uint256[] memory) { return _ownerVaults[owner]; }

    function isUnlocked(uint256 vaultId) external view returns (bool) {
        Vault storage v = _vaults[vaultId];
        require(v.owner != address(0), "no vault");
        return _isUnlocked(v);
    }

    function _settle(Vault storage v) private {
        uint256 accumulated = (v.principal * accRewardPerShare) / ACC_PRECISION;
        if (accumulated > v.rewardDebt) v.storedReward += accumulated - v.rewardDebt;
        v.rewardDebt = accumulated;
    }

    function _activateUnallocated() private {
        if (unallocatedRewards == 0 || totalLocked == 0) return;
        uint256 reward = unallocatedRewards;
        unallocatedRewards = 0;
        accRewardPerShare += (reward * ACC_PRECISION) / totalLocked;
        totalPenaltyShared += reward;
    }

    function _isUnlocked(Vault memory v) private view returns (bool) {
        if (v.closed) return false;
        return block.timestamp >= v.unlockAt || (v.goal > 0 && v.principal >= v.goal);
    }

    function _pay(address recipient, uint256 amount) private {
        (bool ok, ) = payable(recipient).call{value: amount}("");
        require(ok, "payment failed");
    }
}