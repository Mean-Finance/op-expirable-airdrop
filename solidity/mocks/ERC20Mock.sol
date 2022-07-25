// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ERC20Mock is ERC20 {
  constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

  function mint(address receiver, uint256 amount) public {
    _mint(receiver, amount);
  }
}
