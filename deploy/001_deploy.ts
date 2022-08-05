import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { shouldVerifyContract } from '../utils/deploy';

const oneMonth: number = 30 * 24 * 60 * 60; // one month in seconds

let governor: string; // governor address
let token: string; // token address
let monthsTillExpiration: number; // how many months to expiration (since deploy block timestamp)
let merkleRoot: string; // merkle root in hex string

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const network = hre.network.name;
  switch (network) {
    case 'hardhat':
      governor = deployer;
      token = hre.ethers.utils.hexlify(hre.ethers.utils.randomBytes(20));
      monthsTillExpiration = 3;
      merkleRoot = hre.ethers.utils.hexlify(hre.ethers.utils.randomBytes(32));
      break;
    case 'goerli':
      governor = deployer;
      token = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6';
      monthsTillExpiration = 3;
      merkleRoot = hre.ethers.utils.hexlify(hre.ethers.utils.randomBytes(32));
      break;
    case 'optimism':
      governor = '';
      token = '';
      monthsTillExpiration = 3;
      merkleRoot = '';
      break;
  }

  const nowTimestamp = Math.round(Date.now() / 1000);
  const helperArgs = [governor, token, monthsTillExpiration * oneMonth + nowTimestamp, hre.ethers.utils.arrayify(merkleRoot)];

  // deploy
  const deploy = await hre.deployments.deploy('ExpirableAirdrop', {
    contract: 'solidity/ExpirableAirdrop.sol:ExpirableAirdrop',
    from: deployer,
    args: helperArgs,
    log: true,
  });

  // verify
  if (hre.network.name !== 'hardhat' && (await shouldVerifyContract(deploy))) {
    await hre.run('verify:verify', {
      address: deploy.address,
      constructorArguments: helperArgs,
    });
  }
};

deployFunction.dependencies = [];
deployFunction.tags = ['ExpirableAirdrop'];
export default deployFunction;
