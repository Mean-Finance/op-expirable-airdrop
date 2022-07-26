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

  event Claimed(address indexed _claimee, address indexed _receiver, uint256 _amount);
  event Deposited(uint256 _amount);
  event Retrieved(uint256 _timestamp, address _receiver);

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
    address _claimee,
    address _receiver,
    uint256 _amount,
    bytes32[] calldata _proof
  ) internal {
    // CHECKS
    if (block.timestamp > expirationTimestamp) revert Expired();
    if (hasClaimed[_claimee]) revert AlreadyClaimed();
    bytes32 _leaf = keccak256(abi.encodePacked(_claimee, _amount));
    bool _isValidLeaf = MerkleProof.verify(_proof, merkleRoot, _leaf);
    if (!_isValidLeaf) revert NotInMerkle();

    // EFFECTS
    hasClaimed[_claimee] = true;

    // INTERACTIONS
    token.transfer(_receiver, _amount);

    emit Claimed(_claimee, _receiver, _amount);
  }

  /// @notice Allows claiming tokens, if address is part of merkle tree
  /// @param _claimee address of claimee
  /// @param _amount of tokens owed to claimee
  /// @param _proof merkle proof to prove address and amount are in tree
  function claim(
    address _claimee,
    uint256 _amount,
    bytes32[] calldata _proof
  ) external {
    _claim(_claimee, _claimee, _amount, _proof);
  }

  /// @notice Allows claiming tokens and send tokens to a receiver, if address is part of merkle tree
  /// @param _receiver address to send tokens
  /// @param _amount of tokens owed to claimee
  /// @param _proof merkle proof to prove address and amount are in tree
  function claimAndTransfer(
    address _receiver,
    uint256 _amount,
    bytes32[] calldata _proof
  ) external {
    _claim(msg.sender, _receiver, _amount, _proof);
  }

  /// @notice Deposit tokens to airdrop
  /// @param _amount of tokens to deposit
  function depositTokens(uint256 _amount) external {
    // INTERACTIONS
    token.transferFrom(msg.sender, address(this), _amount);

    emit Deposited(_amount);
  }

  /// @notice Return unclaimed tokens to governor
  function retrieveTokens() external {
    // CHECKS
    if (block.timestamp <= expirationTimestamp) revert NotExpired();

    // INTERACTIONS
    address _governor = IGovernable(address(this)).governor();
    token.transfer(_governor, token.balanceOf(address(this)));

    emit Retrieved(block.timestamp, _governor);
  }
}
