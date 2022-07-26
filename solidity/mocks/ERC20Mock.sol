// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ERC20Mock is ERC20 {
  // solhint-disable-next-line no-empty-blocks
  constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

  function mint(address _receiver, uint256 _amount) public {
    _mint(_receiver, _amount);
  }
}
