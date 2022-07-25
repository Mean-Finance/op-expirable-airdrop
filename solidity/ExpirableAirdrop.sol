// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import './utils/Governable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

/// @title ExpirableAirdrop
/// @notice airdrop claimable by members of a merkle tree with expiration date
/// @author Mean Finance (based on: https://github.com/Anish-Agnihotri/merkle-airdrop-starter/blob/master/contracts/src/MerkleClaimERC20.sol)
contract ExpirableAirdrop is Governable {
  IERC20 public immutable token;
  uint256 public immutable expirationTimestamp;
  bytes32 public immutable merkleRoot;
  mapping(address => bool) public hasClaimed;

  error AlreadyClaimed();
  error Expired();
  error NotExpired();
  error NotInMerkle();

  event Claimed(address indexed claimee, address indexed receiver, uint256 amount);
  event Deposited(uint256 amount);
  event Retrieved(uint256 timestamp, address receiver);

  /// @notice Creates a new ExpirableAirdrop contract
  /// @param _governor governor address
  /// @param _token token to airdrop
  /// @param _expirationTimestamp expiration timestamp
  /// @param _merkleRoot of claimees
  constructor(
    address _governor,
    IERC20 _token,
    uint256 _expirationTimestamp,
    bytes32 _merkleRoot
  ) Governable(_governor) {
    token = _token;
    expirationTimestamp = _expirationTimestamp;
    merkleRoot = _merkleRoot;
  }

  function _claim(
    address claimee,
    address receiver,
    uint256 amount,
    bytes32[] calldata proof
  ) internal {
    // CHECKS
    if (block.timestamp > expirationTimestamp) revert Expired();
    if (hasClaimed[claimee]) revert AlreadyClaimed();
    bytes32 leaf = keccak256(abi.encodePacked(claimee, amount));
    bool isValidLeaf = MerkleProof.verify(proof, merkleRoot, leaf);
    if (!isValidLeaf) revert NotInMerkle();

    // EFFECTS
    hasClaimed[claimee] = true;

    // INTERACTIONS
    token.transfer(receiver, amount);

    emit Claimed(claimee, receiver, amount);
  }

  /// @notice Allows claiming tokens, if address is part of merkle tree
  /// @param claimee address of claimee
  /// @param amount of tokens owed to claimee
  /// @param proof merkle proof to prove address and amount are in tree
  function claim(
    address claimee,
    uint256 amount,
    bytes32[] calldata proof
  ) external {
    _claim(claimee, claimee, amount, proof);
  }

  /// @notice Allows claiming tokens and send tokens to a receiver, if address is part of merkle tree
  /// @param receiver address to send tokens
  /// @param amount of tokens owed to claimee
  /// @param proof merkle proof to prove address and amount are in tree
  function claimAndTransfer(
    address receiver,
    uint256 amount,
    bytes32[] calldata proof
  ) external {
    _claim(msg.sender, receiver, amount, proof);
  }

  /// @notice Deposit tokens to airdrop
  /// @param amount of tokens to deposit
  function depositTokens(uint256 amount) external {
    // INTERACTIONS
    token.transferFrom(msg.sender, address(this), amount);

    emit Deposited(amount);
  }

  /// @notice Return unclaimed tokens to governor
  function retrieveTokens() external {
    // CHECKS
    if (block.timestamp <= expirationTimestamp) revert NotExpired();

    // INTERACTIONS
    address governor = IGovernable(address(this)).governor();
    token.transfer(governor, token.balanceOf(address(this)));

    emit Retrieved(block.timestamp, governor);
  }
}
