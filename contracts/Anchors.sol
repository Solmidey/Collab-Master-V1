// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract Anchors {
    event AnchorStored(bytes32 indexed root, bytes32 indexed metadata, address indexed caller);

    bytes32 public lastRoot;
    bytes32 public lastMetadata;

    function anchor(bytes32 root, bytes32 metadata) external {
        lastRoot = root;
        lastMetadata = metadata;
        emit AnchorStored(root, metadata, msg.sender);
    }
}
