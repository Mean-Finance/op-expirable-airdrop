import { then, when, given } from '@utils/bdd';
import { toUnit } from '@utils/bn';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumber, Transaction } from 'ethers';
import { takeSnapshot, time, setBalance, impersonateAccount, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
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
  let accounts: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let root: any;
  let tree: any;
  let token: any;
  let expirableAirdrop: any;
  let airdropAmount: number = 10;
  let airdropAmountBN: BigNumber = toUnit(airdropAmount);
  let snapshot: SnapshotRestorer;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carl: SignerWithAddress;
  let random: SignerWithAddress;
  const randomAddress: string = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  async function prepareAirdrop() {
    let toDeposit = toUnit(airdropAmount * (accounts.length + 1));
    await token.mint(expirableAirdrop.address, toDeposit);
  }

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

    // load accounts
    alice = accounts[1];
    bob = accounts[2];
    carl = accounts[3];
    await impersonateAccount(randomAddress);
    await setBalance(randomAddress, toUnit(10000));
    random = await ethers.getSigner(randomAddress);

    // save snapshot for later
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
  });

  when('depositTokens()', () => {
    let toDeposit: BigNumber;
    let tx: Transaction;

    given(async () => {
      toDeposit = toUnit(airdropAmount * (accounts.length + 1));

      // transfer some tokens
      await token.mint(deployer.address, toDeposit);

      // approve
      await token.approve(expirableAirdrop.address, ethers.constants.MaxUint256);

      // deposit
      await expirableAirdrop.depositTokens(toDeposit);
    });

    then('airdrop is deposited', async () => {
      // expect
      expect(await token.balanceOf(expirableAirdrop.address)).equal(toDeposit);
    });

    then('event is emitted', async () => {
      // expect
      expect(tx).to.have.emit(expirableAirdrop, 'Deposited').withArgs(toDeposit);
    });
  });

  when('claimAndSendToClaimee()', () => {
    let leaf: any;
    let proof: any;

    given(async () => {
      await prepareAirdrop();

      leaf = getLeaf(alice.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);
    });

    when('airdrop is claimed by claimee', () => {
      let tx: Transaction;

      given(async () => {
        tx = await expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof);
      });

      then('tokens are transferred to claimee', async () => {
        // expect
        expect(await token.balanceOf(alice.address)).equal(airdropAmountBN);
      });

      then('event is emitted', async () => {
        // expect
        expect(tx).to.have.emit(expirableAirdrop, 'Claimed').withArgs(alice.address, alice.address, airdropAmountBN);
      });

      then('claimee is marked as claimed', async () => {
        // expect
        await expect(expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof)).to.be.revertedWithCustomError(
          expirableAirdrop,
          'AlreadyClaimed'
        );
      });
    });

    when('airdrop is claimed on behalf of', () => {
      let tx: Transaction;

      given(async () => {
        tx = await expirableAirdrop.connect(bob).claimAndSendToClaimee(alice.address, airdropAmountBN, proof);
      });

      then('tokens are transferred to claimee', async () => {
        // expect
        expect(await token.balanceOf(alice.address)).equal(airdropAmountBN);
      });

      then('event is emitted', async () => {
        // expect
        expect(tx).to.have.emit(expirableAirdrop, 'Claimed').withArgs(alice.address, alice.address, airdropAmountBN);
      });

      then('claimee is marked as claimed', async () => {
        // expect
        await expect(expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof)).to.be.revertedWithCustomError(
          expirableAirdrop,
          'AlreadyClaimed'
        );
      });
    });

    then('revert if no airdrop', async () => {
      leaf = getLeaf(randomAddress, airdropAmountBN);
      proof = tree.getHexProof(leaf);

      await expect(expirableAirdrop.connect(random).claimAndSendToClaimee(randomAddress, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'NotInMerkle'
      );
    });

    then('revert if expired', async () => {
      // time travelling
      await time.increase(3 * oneMonth);

      // expect
      await expect(expirableAirdrop.connect(alice).claimAndSendToClaimee(alice.address, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'Expired'
      );
    });
  });

  when('claimAndTransfer()', () => {
    let leaf: any;
    let proof: any;

    given(async () => {
      await prepareAirdrop();

      leaf = getLeaf(bob.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);
    });

    when('airdrop is claimed by claimee', () => {
      let tx: Transaction;

      given(async () => {
        tx = await expirableAirdrop.connect(bob).claimAndTransfer(randomAddress, airdropAmountBN, proof);
      });

      then('tokens are transferred to claimee', async () => {
        // expect
        expect(await token.balanceOf(randomAddress)).equal(airdropAmountBN);
      });

      then('event is emitted', async () => {
        // expect
        expect(tx).to.have.emit(expirableAirdrop, 'Claimed').withArgs(bob.address, randomAddress, airdropAmountBN);
      });

      then('claimee is marked as claimed', async () => {
        // expect
        await expect(expirableAirdrop.connect(bob).claimAndTransfer(alice.address, airdropAmountBN, proof)).to.be.revertedWithCustomError(
          expirableAirdrop,
          'AlreadyClaimed'
        );
      });
    });

    then('revert if no airdrop', async () => {
      leaf = getLeaf(randomAddress, airdropAmountBN);
      proof = tree.getHexProof(leaf);

      await expect(expirableAirdrop.connect(random).claimAndTransfer(randomAddress, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'NotInMerkle'
      );
    });

    then('revert if expired', async () => {
      leaf = getLeaf(carl.address, airdropAmountBN);
      proof = tree.getHexProof(leaf);

      // time travelling
      await time.increase(3 * oneMonth);

      // expect
      await expect(expirableAirdrop.connect(carl).claimAndTransfer(randomAddress, airdropAmountBN, proof)).to.be.revertedWithCustomError(
        expirableAirdrop,
        'Expired'
      );
    });
  });

  when('retrieveUnclaimedTokens()', () => {
    let balanceBefore: BigNumber;

    given(async () => {
      await prepareAirdrop();
      balanceBefore = await token.balanceOf(expirableAirdrop.address);
    });

    then('revert if not expired yet', async () => {
      // try to retrieve
      await expect(expirableAirdrop.retrieveUnclaimedTokens()).to.be.revertedWithCustomError(expirableAirdrop, 'NotExpired');
    });

    when('tokens back in governor wallet', () => {
      let tx: Transaction;

      given(async () => {
        // time travelling
        await time.increase(3 * oneMonth);

        tx = await expirableAirdrop.retrieveUnclaimedTokens();
      });

      then('contract balance before retrieving is more than zero', async () => {
        // expect
        expect(Number(balanceBefore)).greaterThan(0);
      });

      then('tokens are transferred to governance', async () => {
        // expect
        expect(await token.balanceOf(deployer.address)).equal(balanceBefore);
      });

      then('event is emitted', async () => {
        // expect
        expect(tx).to.have.emit(expirableAirdrop, 'Retrieved').withArgs(deployer.address);
      });

      then('contract balance is zero', async () => {
        // expect
        expect(await token.balanceOf(expirableAirdrop.address)).equal(0);
      });
    });
  });
});
