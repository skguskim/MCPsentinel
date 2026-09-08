// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Trust metadata for the current version of an MCP tool, not a code audit.
/// @dev IDs are derived from the publisher and its exact tool name. Every state
/// change advances a revision, binding verifier decisions to the reviewed state.
contract ToolRegistry is AccessControl {
    uint256 public constant REGISTRY_VERSION = 2;
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    struct Tool {
        address publisher;
        string version;
        bytes32 manifestHash;
        bytes32 permissionHash;
        bool approved;
        bool revoked;
        bool exists;
        uint256 revision;
    }

    mapping(bytes32 toolId => Tool) private tools;
    mapping(bytes32 toolId => mapping(bytes32 versionHash => bool)) private usedVersions;

    error InvalidAdministrator();
    error InvalidToolMetadata();
    error ToolNotFound(bytes32 toolId);
    error NotRevoker(bytes32 toolId, address caller);
    error VersionAlreadyUsed(bytes32 toolId, string version);
    error VersionMismatch(bytes32 toolId, string currentVersion, string requestedVersion);
    error RevisionMismatch(bytes32 toolId, uint256 currentRevision, uint256 expectedRevision);
    error ToolIsRevoked(bytes32 toolId);
    error ToolIsNotRevoked(bytes32 toolId);

    event ToolRegistered(
        bytes32 indexed toolId,
        address indexed publisher,
        string toolName,
        string version,
        bytes32 manifestHash,
        bytes32 permissionHash,
        uint256 revision
    );
    event VersionApproved(bytes32 indexed toolId, string version, address indexed verifier, uint256 revision);
    event VersionRestored(bytes32 indexed toolId, string version, address indexed verifier, uint256 revision);
    event ToolRevoked(bytes32 indexed toolId, address indexed revokedBy, uint256 revision);

    constructor(address administrator) {
        if (administrator == address(0)) revert InvalidAdministrator();
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
        _grantRole(VERIFIER_ROLE, administrator);
    }

    /// @notice Names are exact UTF-8 strings, scoped to a publisher, without case folding.
    function computeToolId(address publisher, string memory toolName) public pure returns (bytes32) {
        if (publisher == address(0) || bytes(toolName).length == 0) revert InvalidToolMetadata();
        return keccak256(abi.encode(publisher, toolName));
    }

    /// @notice Publish in msg.sender's namespace; callers cannot reserve another publisher's ID.
    /// @dev Version strings cannot be reused, binding approvals to immutable hashes.
    function registerTool(
        string calldata toolName,
        string calldata version,
        bytes32 manifestHash,
        bytes32 permissionHash
    ) external returns (bytes32 toolId) {
        toolId = computeToolId(msg.sender, toolName);
        if (
            bytes(version).length == 0 ||
            manifestHash == bytes32(0) || permissionHash == bytes32(0)
        ) revert InvalidToolMetadata();

        Tool storage tool = tools[toolId];

        bytes32 versionHash = keccak256(bytes(version));
        if (usedVersions[toolId][versionHash]) revert VersionAlreadyUsed(toolId, version);
        usedVersions[toolId][versionHash] = true;

        tool.publisher = msg.sender;
        tool.version = version;
        tool.manifestHash = manifestHash;
        tool.permissionHash = permissionHash;
        tool.approved = false;
        tool.exists = true;
        tool.revision += 1;
        // Publishing an update must not clear an existing revocation.
        emit ToolRegistered(toolId, msg.sender, toolName, version, manifestHash, permissionHash, tool.revision);
    }

    /// @notice Approve the reviewed version and revision. Never lifts revocation.
    function approveVersion(bytes32 toolId, string calldata version, uint256 expectedRevision)
        external onlyRole(VERIFIER_ROLE)
    {
        Tool storage tool = _reviewedTool(toolId, version, expectedRevision);
        if (tool.revoked) revert ToolIsRevoked(toolId);
        tool.approved = true;
        tool.revision += 1;
        emit VersionApproved(toolId, version, msg.sender, tool.revision);
    }

    /// @notice Explicitly restore and approve a revoked version after reviewing its latest revision.
    function restoreVersion(bytes32 toolId, string calldata version, uint256 expectedRevision)
        external onlyRole(VERIFIER_ROLE)
    {
        Tool storage tool = _reviewedTool(toolId, version, expectedRevision);
        if (!tool.revoked) revert ToolIsNotRevoked(toolId);
        tool.approved = true;
        tool.revoked = false;
        tool.revision += 1;
        emit VersionRestored(toolId, version, msg.sender, tool.revision);
    }

    /// @notice A publisher or verifier can immediately revoke every call to a tool.
    function revokeTool(bytes32 toolId) external {
        Tool storage tool = _requireTool(toolId);
        if (tool.publisher != msg.sender && !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert NotRevoker(toolId, msg.sender);
        }
        tool.approved = false;
        tool.revoked = true;
        // Even repeated revocation invalidates any pending restoration request.
        tool.revision += 1;
        emit ToolRevoked(toolId, msg.sender, tool.revision);
    }

    function getTool(bytes32 toolId) external view returns (Tool memory) {
        return _requireTool(toolId);
    }

    function _requireTool(bytes32 toolId) private view returns (Tool storage tool) {
        tool = tools[toolId];
        if (!tool.exists) revert ToolNotFound(toolId);
    }

    function _reviewedTool(bytes32 toolId, string calldata version, uint256 expectedRevision)
        private view returns (Tool storage tool)
    {
        tool = _requireTool(toolId);
        if (tool.revision != expectedRevision) {
            revert RevisionMismatch(toolId, tool.revision, expectedRevision);
        }
        if (keccak256(bytes(tool.version)) != keccak256(bytes(version))) {
            revert VersionMismatch(toolId, tool.version, version);
        }
    }
}
