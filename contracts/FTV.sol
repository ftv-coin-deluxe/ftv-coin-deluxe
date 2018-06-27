/*
Implements ERC 20 Token standard: https://github.com/ethereum/EIPs/issues/20.
*/
pragma solidity ^0.4.11;


import "zeppelin/token/StandardToken.sol";

contract FTV is StandardToken {

    // data structures
    bool public presaleFinished = false;

    uint256 public soldTokens;

    string public constant name = "FTV Coin Deluxe";

    string public constant symbol = "FTV";

    uint8 public constant decimals = 18;

    mapping(address => bool) public whitelist;

    mapping(address => address) public referral;

    address public reserves;

    address public stateControl;

    address public whitelistControl;

    address public tokenAssignmentControl;

    uint256 constant pointMultiplier = 1e18; //100% = 1*10^18 points

    uint256 public constant maxTotalSupply = 100000000 * pointMultiplier; //100M tokens

    event Mint(address indexed to, uint256 amount);
    event MintFinished();

    bool public mintingFinished = false;


    //this creates the contract and stores the owner. it also passes in 3 addresses to be used later during the lifetime of the contract.
    function FTV(
        address _stateControl
      , address _whitelistControl
      , address _tokenAssignmentControl
      , address _reserves
    ) public
    {
        stateControl = _stateControl;
        whitelistControl = _whitelistControl;
        tokenAssignmentControl = _tokenAssignmentControl;
        totalSupply = maxTotalSupply;
        soldTokens = 0;
        reserves = _reserves;
        balances[reserves] = totalSupply;
        Mint(reserves, totalSupply);
        Transfer(0x0, reserves, totalSupply);
        finishMinting();
    }

    event Whitelisted(address addr);

    event Referred(address parent, address child);

    modifier onlyWhitelist() {
        require(msg.sender == whitelistControl);
        _;
    }

    modifier onlyStateControl() {
        require(msg.sender == stateControl);
        _;
    }

    modifier onlyTokenAssignmentControl() {
        require(msg.sender == tokenAssignmentControl);
        _;
    }

    modifier requirePresale() {
        require(presaleFinished == false);
        _;
    }

    // Make sure this contract cannot receive ETH.
    function() payable public
    {
        revert();
    }

    function issueTokensToUser(address beneficiary, uint256 amount)
    internal
    {
        uint256 soldTokensAfterInvestment = soldTokens.add(amount);
        require(soldTokensAfterInvestment <= maxTotalSupply);

        balances[beneficiary] = balances[beneficiary].add(amount);
        balances[reserves] = balances[reserves].sub(amount);
        soldTokens = soldTokensAfterInvestment;
        Transfer(reserves, beneficiary, amount);
    }

    function issueTokensWithReferral(address beneficiary, uint256 amount)
    internal
    {
        issueTokensToUser(beneficiary, amount);
        if (referral[beneficiary] != 0x0) {
            // Send 5% referral bonus to the "parent".
            issueTokensToUser(referral[beneficiary], amount.mul(5).div(100));
        }
    }

    function addPresaleAmount(address beneficiary, uint256 amount)
    public
    onlyTokenAssignmentControl
    requirePresale
    {
        issueTokensWithReferral(beneficiary, amount);
    }

    function finishMinting()
    internal
    {
        mintingFinished = true;
        MintFinished();
    }

    function finishPresale()
    public
    onlyStateControl
    {
        presaleFinished = true;
    }

    function addToWhitelist(address _whitelisted)
    public
    onlyWhitelist
    {
        whitelist[_whitelisted] = true;
        Whitelisted(_whitelisted);
    }


    function addReferral(address _parent, address _child)
    public
    onlyWhitelist
    {
        require(_parent != _child);
        require(whitelist[_parent] == true && whitelist[_child] == true);
        require(referral[_child] == 0x0);
        referral[_child] = _parent;
        Referred(_parent, _child);
    }

    //if this contract gets a balance in some other ERC20 contract - or even iself - then we can rescue it.
    function rescueToken(ERC20Basic _foreignToken, address _to)
    public
    onlyTokenAssignmentControl
    {
        _foreignToken.transfer(_to, _foreignToken.balanceOf(this));
    }
}
