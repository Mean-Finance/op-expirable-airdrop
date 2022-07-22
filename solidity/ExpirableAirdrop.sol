// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

/// @title ExpirableAirdrop
/// @notice airdrop claimable by members of a merkle tree with expiration date
/// @author Mean Finance (based on: https://github.com/Anish-Agnihotri/merkle-airdrop-starter/blob/master/contracts/src/MerkleClaimERC20.sol)
contract ExpirableAirdrop is Ownable {
  IERC20 public immutable token;
  uint256 public immutable expirationTimestamp;
  bytes32 public immutable merkleRoot;
  mapping(address => bool) public hasClaimed;

  error AlreadyClaimed();
  error Expired();
  error NotInMerkle();

  event Claimed(address indexed to, uint256 amount);

  /// @notice Creates a new ExpirableAirdrop contract
  /// @param _token token to airdrop
  /// @param _merkleRoot of claimees
  constructor(
    IERC20 _token,
    uint256 _expirationTimestamp,
    bytes32 _merkleRoot
  ) {
    token = _token;
    expirationTimestamp = _expirationTimestamp;
    merkleRoot = _merkleRoot;
  }

  /// @notice Allows claiming tokens if address is part of merkle tree
  /// @param to address of claimee
  /// @param amount of tokens owed to claimee
  /// @param proof merkle proof to prove address and amount are in tree
  function claim(
    address to,
    uint256 amount,
    bytes32[] calldata proof
  ) external {
    // CHECKS
    if (block.timestamp > expirationTimestamp) revert Expired();
    if (hasClaimed[to]) revert AlreadyClaimed();
    bytes32 leaf = keccak256(abi.encodePacked(to, amount));
    bool isValidLeaf = MerkleProof.verify(proof, merkleRoot, leaf);
    if (!isValidLeaf) revert NotInMerkle();

    // EFFECTS
    hasClaimed[to] = true;

    // INTERACTIONS
    token.transfer(to, amount);

    emit Claimed(to, amount);
  }
}
