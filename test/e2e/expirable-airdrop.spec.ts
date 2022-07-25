import { then, when, given } from '@utils/bdd';
import { toUnit } from '@utils/bn';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { takeSnapshot, SnapshotRestorer, time } from '@nomicfoundation/hardhat-network-helpers';
import { MerkleTree } from 'merkletreejs';

function createMerkleRoot(accounts: any[], amount: number) {
  let toClaim = ethers.utils.parseUnits(String(amount));

  const leaves = accounts.map((x) => {
    let address = x.address;
    return Buffer.from(ethers.utils.solidityKeccak256(['address', 'uint256'], [address, toClaim]).slice(2), 'hex');
  });

  const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  // const leaf = ethers.utils.solidityKeccak256(['address', 'uint256'], [accounts[0].address, toClaim]);
  // const proof = tree.getProof(leaf);
  // console.log(tree.verify(proof, leaf, root));

  return root;
}

describe('Expirable airdrop', () => {
  let nowTimestamp: number;
  let expirationTimestamp: number;
  let accounts: any[];
  let deployer: any;
  let root: any;
  let token: any;
  let expirableAirdrop: any;
  let airdropAmount: number = 10;

  before(async () => {
    nowTimestamp = await time.latest();
    expirationTimestamp = nowTimestamp + 3 * 30 * 24 * 60 * 60; // 3 months
    [deployer, ...accounts] = await ethers.getSigners();

    console.log('->', accounts.length);

    root = createMerkleRoot(accounts, airdropAmount);

    // deploy erc20 mock
    const Token = await ethers.getContractFactory('ERC20Mock');
    token = await Token.deploy('Token', 'TKN');

    // deploy contract
    const ExpirableAirdrop = await ethers.getContractFactory('ExpirableAirdrop');
    expirableAirdrop = await ExpirableAirdrop.deploy(token.address, expirationTimestamp, root);
  });

  when('deposit', () => {
    let toDeposit: BigNumber;

    given(async () => {
      toDeposit = toUnit(airdropAmount * (accounts.length + 1));

      // transfer some tokens
      await token.mint(deployer.address, toDeposit);
    });

    then('airdrop is deposited', async () => {
      // approve
      await token.approve(expirableAirdrop.address, ethers.constants.MaxUint256);

      // deposit
      await expirableAirdrop.depositTokens(toDeposit);

      // expect
      expect(await token.balanceOf(expirableAirdrop.address)).equal(toDeposit);
    });
  });

  when('claim', () => {
    given(async () => {});

    then('airdrop claimed', async () => {});

    then('revert if already claimed', async () => {});

    then('revert if no airdrop', async () => {});

    then('revert if expired', async () => {});
  });

  when('claim and transfer', () => {
    given(async () => {});

    then('airdrop claimed', async () => {});
  });

  when('retrieve', () => {
    given(async () => {});

    then('revert if not expired yet', async () => {});

    then('tokens back in governor wallet', async () => {});
  });
});
