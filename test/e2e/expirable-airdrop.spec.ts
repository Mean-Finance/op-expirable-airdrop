import { then, when, given } from '@utils/bdd';
import { toUnit } from '@utils/bn';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, Wallet } from 'ethers';
import { takeSnapshot, time, setBalance, impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { MerkleTree } from 'merkletreejs';

function getLeaf(address: string, amount: BigNumber) {
  return Buffer.from(ethers.utils.solidityKeccak256(['address', 'uint256'], [address, amount]).slice(2), 'hex');
}

function createMerkleRoot(accounts: any[], amount: BigNumber) {
  let toClaim = amount;

  const leaves = accounts.map((x) => {
    let address = x.address;
    return getLeaf(address, toClaim);
  });

  const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  return [root, tree];
}

describe('Expirable airdrop', () => {
  let nowTimestamp: number;
  const oneMonth: number = 30 * 24 * 60 * 60; // one month in seconds
  let expirationTimestamp: number;
  let accounts: any[];
  let deployer: any;
  let root: any;
  let tree: any;
  let token: any;
  let expirableAirdrop: any;
  let airdropAmount: number = 10;
  let airdropAmountBN: BigNumber = toUnit(airdropAmount);
  let snapshot: any;
  const randomAddress: string = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const randomAddress2: string = '0x2089035369B33403DdcaBa6258c34e0B3FfbbBd9';

  before(async () => {
    nowTimestamp = await time.latest();
    expirationTimestamp = nowTimestamp + 3 * oneMonth; // 3 months
    [deployer, ...accounts] = await ethers.getSigners();

    [root, tree] = createMerkleRoot(accounts, airdropAmountBN);

    // deploy erc20 mock
    const TokenFactory = await ethers.getContractFactory('ERC20Mock');
    token = await TokenFactory.deploy('Token', 'TKN');

    // deploy contract
    const ExpirableAirdropFactory = await ethers.getContractFactory('ExpirableAirdrop');
    expirableAirdrop = await ExpirableAirdropFactory.deploy(deployer.address, token.address, expirationTimestamp, root);
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

      // save snapshot for later
      snapshot = await takeSnapshot();

      // expect
      expect(await token.balanceOf(expirableAirdrop.address)).equal(toDeposit);
    });
  });

  when('claimAndSendToClaimee', () => {
    let alice: SignerWithAddress;
    let leaf: any;
    let proof: any;

    given(async () => {
      alice = accounts[1];
      leaf = getLeaf(alice.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);
    });

    then('airdrop claimed', async () => {
      // user claims airdrop
      await expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof);

      // expect
      expect(await token.balanceOf(alice.address)).equal(airdropAmountBN);
    });

    then('revert if already claimed', async () => {
      await expect(expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'AlreadyClaimed'
      );
    });

    then('revert if no airdrop', async () => {
      await impersonateAccount(randomAddress);
      let random: any = await ethers.getSigner(randomAddress);
      await setBalance(randomAddress, toUnit(10000));
      let _leaf = getLeaf(randomAddress, airdropAmountBN);
      let _proof = tree.getHexProof(_leaf);

      await expect(expirableAirdrop.connect(random).claimAndSendToClaimee(randomAddress, airdropAmountBN, _proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'NotInMerkle'
      );
    });
  });

  when('claimAndSendToClaimee and transfer', () => {
    let bob: SignerWithAddress;
    let carl: SignerWithAddress;
    let receiver: SignerWithAddress;
    let leaf: any;
    let proof: any;

    given(async () => {
      bob = accounts[2];
      carl = accounts[3];
      await impersonateAccount(randomAddress2);
      receiver = await ethers.getSigner(randomAddress2);
      await setBalance(randomAddress, toUnit(10000));
      leaf = getLeaf(bob.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);
    });

    then('airdrop claimed', async () => {
      // user claims airdrop
      await expirableAirdrop.connect(bob).claimAndTransfer(randomAddress2, airdropAmountBN, proof);

      // expect
      expect(await token.balanceOf(randomAddress2)).equal(airdropAmountBN);
    });

    then('revert if expired', async () => {
      leaf = getLeaf(carl.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);

      // time travelling
      await time.increase(3 * oneMonth);

      // expeect
      await expect(expirableAirdrop.connect(carl).claimAndTransfer(randomAddress2, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'Expired'
      );
    });
  });

  when('retrieve', () => {
    given(async () => {
      await snapshot.restore();
    });

    then('revert if not expired yet', async () => {
      // try to retrieve
      await expect(expirableAirdrop.retrieveUnclaimedTokens()).to.be.revertedWithCustomError(expirableAirdrop, 'NotExpired');
    });

    then('tokens back in governor wallet', async () => {
      let balanceBefore = await token.balanceOf(expirableAirdrop.address);

      // time travelling
      await time.increase(3 * oneMonth);

      // retrieve
      await expirableAirdrop.retrieveUnclaimedTokens();

      // expect
      expect(Number(balanceBefore)).greaterThan(0);
      expect(await token.balanceOf(expirableAirdrop.address)).equal(0);
      expect(await token.balanceOf(deployer.address)).equal(balanceBefore);
    });
  });
});
