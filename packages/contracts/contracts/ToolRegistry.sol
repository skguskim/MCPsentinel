// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Trust metadata for the current version of an MCP tool, not a code audit.
/// @dev Publishers own their IDs permanently. Verifiers independently approve versions.
contract ToolRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    struct Tool {
        address publisher;
        string version;
        bytes32 manifestHash;
        bytes32 permissionHash;
        bool approved;
        bool revoked;
        bool exists;
    }

    mapping(bytes32 toolId => Tool) private tools;
    mapping(bytes32 toolId => mapping(bytes32 versionHash => bool)) private usedVersions;

    error InvalidAdministrator();
    error InvalidToolMetadata();
    error ToolNotFound(bytes32 toolId);
    error NotPublisher(bytes32 toolId, address caller);
    error NotRevoker(bytes32 toolId, address caller);
    error VersionAlreadyUsed(bytes32 toolId, string version);
    error VersionMismatch(bytes32 toolId, string currentVersion, string requestedVersion);

    event ToolRegistered(
        bytes32 indexed toolId,
        address indexed publisher,
        string version,
        bytes32 manifestHash,
        bytes32 permissionHash
    );
    event VersionApproved(bytes32 indexed toolId, string version, address indexed verifier);
    event ToolRevoked(bytes32 indexed toolId, address indexed revokedBy);

    constructor(address administrator) {
        if (administrator == address(0)) revert InvalidAdministrator();
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
        _grantRole(VERIFIER_ROLE, administrator);
    }

    /// @notice Register a new tool or publish a new, initially unapproved version.
    /// @dev Version strings cannot be reused, binding approveVersion to immutable hashes.
    function registerTool(
        bytes32 toolId,
        string calldata version,
        bytes32 manifestHash,
        bytes32 permissionHash
    ) external {
        if (
            toolId == bytes32(0) || bytes(version).length == 0 ||
            manifestHash == bytes32(0) || permissionHash == bytes32(0)
        ) revert InvalidToolMetadata();

        Tool storage tool = tools[toolId];
        if (tool.exists && tool.publisher != msg.sender) revert NotPublisher(toolId, msg.sender);

        bytes32 versionHash = keccak256(bytes(version));
        if (usedVersions[toolId][versionHash]) revert VersionAlreadyUsed(toolId, version);
        usedVersions[toolId][versionHash] = true;

        tool.publisher = msg.sender;
        tool.version = version;
        tool.manifestHash = manifestHash;
        tool.permissionHash = permissionHash;
        tool.approved = false;
        tool.exists = true;
        // Publishing an update must not clear an existing revocation.
        emit ToolRegistered(toolId, msg.sender, version, manifestHash, permissionHash);
    }

    /// @notice Approve exactly the current version; this explicitly lifts revocation.
    function approveVersion(bytes32 toolId, string calldata version) external onlyRole(VERIFIER_ROLE) {
        Tool storage tool = _requireTool(toolId);
        if (keccak256(bytes(tool.version)) != keccak256(bytes(version))) {
            revert VersionMismatch(toolId, tool.version, version);
        }
        tool.approved = true;
        tool.revoked = false;
        emit VersionApproved(toolId, version, msg.sender);
    }

    /// @notice A publisher or verifier can immediately revoke every call to a tool.
    function revokeTool(bytes32 toolId) external {
        Tool storage tool = _requireTool(toolId);
        if (tool.publisher != msg.sender && !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert NotRevoker(toolId, msg.sender);
        }
        tool.approved = false;
        tool.revoked = true;
        emit ToolRevoked(toolId, msg.sender);
    }

    function getTool(bytes32 toolId) external view returns (Tool memory) {
        return _requireTool(toolId);
    }

    function _requireTool(bytes32 toolId) private view returns (Tool storage tool) {
        tool = tools[toolId];
        if (!tool.exists) revert ToolNotFound(toolId);
    }
}
