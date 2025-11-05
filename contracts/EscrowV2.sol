// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EscrowV2 is EIP712 {
    event Deposit(address indexed from, uint256 amount);
    event Release(address indexed executor, address[] recipients, uint256[] amounts, uint256 total);
    event Refund(address indexed to, uint256 amount);
    event TimeLockTriggered(address indexed caller, uint256 deadline);
    event DisputeStateChanged(bool locked);

    error InvalidRecipients();
    error InvalidSignature();
    error NotAuthorized();
    error AlreadyReleased();
    error InDispute();
    error DeadlineNotReached();
    error ActiveDispute();
    error AlreadyRefunded();

    bytes32 private constant RELEASE_TYPEHASH =
        keccak256("Release(bytes32 recipientsHash,bytes32 amountsHash,uint256 nonce)");

    address public immutable payer;
    address public immutable controller;
    uint256 public immutable deadline;
    uint256 public immutable refundWindow;

    address[] private _requiredSigners;
    mapping(address => bool) private _isSigner;

    bool public released;
    bool public refunded;
    bool public disputed;

    uint256 public nonce;

    constructor(
        address _payer,
        address[] memory signers,
        address _controller,
        uint256 _deadline,
        uint256 _refundWindow
    ) EIP712("MomentumEscrow", "2") {
        require(_payer != address(0), "payer required");
        payer = _payer;
        controller = _controller;
        deadline = _deadline;
        refundWindow = _refundWindow;
        if (signers.length > 0) {
            for (uint256 i = 0; i < signers.length; i++) {
                address signer = signers[i];
                require(signer != address(0), "invalid signer");
                require(!_isSigner[signer], "duplicate signer");
                _isSigner[signer] = true;
            }
            _requiredSigners = signers;
        }
    }

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        require(!released && !refunded, "inactive");
        require(msg.value > 0, "amount required");
        emit Deposit(msg.sender, msg.value);
    }

    function requiredSigners() external view returns (address[] memory) {
        return _requiredSigners;
    }

    function setDisputeState(bool lock) external {
        if (msg.sender != controller && msg.sender != payer) {
            if (!_isSigner[msg.sender]) {
                revert NotAuthorized();
            }
        }
        disputed = lock;
        emit DisputeStateChanged(lock);
    }

    function _computeReleaseHash(address[] memory recipients, uint256[] memory amounts)
        internal
        view
        returns (bytes32)
    {
        bytes32 recipientsHash = keccak256(abi.encodePacked(recipients));
        bytes32 amountsHash = keccak256(abi.encodePacked(amounts));
        return _hashTypedDataV4(
            keccak256(abi.encode(RELEASE_TYPEHASH, recipientsHash, amountsHash, nonce))
        );
    }

    function _verifySignatures(bytes32 digest, bytes[] memory signatures) internal view {
        uint256 signersLength = _requiredSigners.length;
        require(signersLength > 0, "no signers");
        if (signatures.length != signersLength) {
            revert InvalidSignature();
        }
        bool[] memory seen = new bool[](signersLength);
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ECDSA.recover(digest, signatures[i]);
            bool matched;
            for (uint256 j = 0; j < signersLength; j++) {
                if (_requiredSigners[j] == signer && !seen[j]) {
                    seen[j] = true;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                revert InvalidSignature();
            }
        }
    }

    function release(
        address[] memory recipients,
        uint256[] memory amounts,
        bytes[] memory signatures
    ) external {
        if (disputed) revert InDispute();
        if (released) revert AlreadyReleased();
        if (refunded) revert AlreadyRefunded();
        require(recipients.length == amounts.length && recipients.length > 0, "length mismatch");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        require(total <= address(this).balance, "insufficient funds");

        if (controller != address(0) && msg.sender == controller) {
            // controller path, no signatures required
        } else {
            bytes32 digest = _computeReleaseHash(recipients, amounts);
            _verifySignatures(digest, signatures);
        }

        released = true;
        nonce += 1;
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = payable(recipients[i]).call{value: amounts[i]}("");
            require(ok, "transfer failed");
        }
        emit Release(msg.sender, recipients, amounts, total);
    }

    function refund() external {
        if (released) revert AlreadyReleased();
        if (refunded) revert AlreadyRefunded();
        if (msg.sender != payer) revert NotAuthorized();
        refunded = true;
        uint256 bal = address(this).balance;
        (bool ok, ) = payable(payer).call{value: bal}("");
        require(ok, "refund failed");
        emit Refund(payer, bal);
    }

    function timeLockRefund(uint256 _deadline) external {
        if (released) revert AlreadyReleased();
        if (refunded) revert AlreadyRefunded();
        if (_deadline != deadline) revert DeadlineNotReached();
        if (block.timestamp < deadline + refundWindow) revert DeadlineNotReached();
        refunded = true;
        uint256 bal = address(this).balance;
        (bool ok, ) = payable(payer).call{value: bal}("");
        require(ok, "refund failed");
        emit TimeLockTriggered(msg.sender, _deadline);
        emit Refund(payer, bal);
    }
}
