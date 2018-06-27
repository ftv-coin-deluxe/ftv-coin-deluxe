import EVMThrow from './helpers/EVMThrow'

import {
  advanceBlock,
  advanceToBlock,
  increaseTime,
  increaseTimeTo,
  duration,
  revert,
  latestTime
} from 'truffle-test-helpers';

const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const TokenContract = artifacts.require("./FTV.sol");


contract('Token funded', function (accounts) {


    const defaultKeyDoNotUse = accounts[0];
    const expectedStateControl = accounts[1];
    const expectedWhitelist = accounts[2];
    const expectedTokenAssignmentControl = accounts[3];
    const expectedReserves = accounts[4];

    const user1 = accounts[6];
    const user2 = accounts[7];
    const user3 = accounts[8];

    const user1SendFunds = web3.toWei(1, "ether");

    it("should have an address", async function () {
        let theToken = await TokenContract.deployed();
        theToken.should.exist;
    });

    it("should have an owner from our known accounts", async function () {
        let theToken = await TokenContract.deployed();
        // Compare hex strings instead of numbers so errors become more readable.
        (await theToken.stateControl()).toString(16).should.be.equal(expectedStateControl.toString(16));
        (await theToken.whitelistControl()).toString(16).should.be.equal(expectedWhitelist.toString(16));
        (await theToken.tokenAssignmentControl()).toString(16).should.be.equal(expectedTokenAssignmentControl.toString(16));
        (await theToken.reserves()).toString(16).should.be.equal(expectedReserves.toString(16));
    });

    it("should be in presale state", async function () {
        let theToken = await TokenContract.deployed();
        (await theToken.presaleFinished()).should.be.equal(false);
    });

    it("should have initial account balances", async function () {
        let theToken = await TokenContract.deployed();
        (await theToken.balanceOf(expectedReserves)).should.be.bignumber.equal(await theToken.maxTotalSupply());
    });

    it("should allow a token transfer in presale state", async function () {
        let theToken = await TokenContract.deployed();
        const tokenSendAmount = web3.toWei(1, "ether");
        await theToken.transfer(user3, tokenSendAmount, {from: expectedReserves}).should.not.be.rejected;
        (await theToken.balanceOf(expectedReserves)).should.be.bignumber.equal((await theToken.maxTotalSupply()).minus(tokenSendAmount));
        (await theToken.balanceOf(user3)).should.be.bignumber.equal(tokenSendAmount);
    });

    it("should not whitelist by default address user1.", async function () {
        let theToken = await TokenContract.deployed();
        let isUser1Whitelisted = await theToken.whitelist(user1);
        isUser1Whitelisted.should.equal(false);
    });

    it("should fail to whitelist address user1 without correct key.", async function () {
        let theToken = await TokenContract.deployed();
        await theToken.addToWhitelist(user1).should.be.rejectedWith(revert);
        let isUser1Whitelisted = await theToken.whitelist(user1);
        isUser1Whitelisted.should.equal(false);
    });

    it("should whitelist address user1 with correct key.", async function () {
        let theToken = await TokenContract.deployed();
        const callResult = await theToken.addToWhitelist(user1, {from: expectedWhitelist}).should.not.be.rejected;
        const expWhitelistEvent = callResult.logs[0];
        expWhitelistEvent.event.should.be.equal('Whitelisted');
        expWhitelistEvent.args.addr.should.be.equal(user1);
        let isUser1Whitelisted = await theToken.whitelist(user1);
        isUser1Whitelisted.should.equal(true);
    });

    it("should reject funds even from whitelisted address.", async function () {
        let theToken = await TokenContract.deployed();
        // make sure another investment works before the time jump, after which it is rejected.
        const investAmount = web3.toWei(0.001, "ether");
        await theToken.sendTransaction({from: user1, value: investAmount}).should.be.rejectedWith(revert);
    });

    it("should allow adding a presale amount in presale.", async function () {
        let theToken = await TokenContract.deployed();
        const balanceBefore = (await theToken.balanceOf(user1));
        const reservesBefore = (await theToken.balanceOf(expectedReserves));
        const soldBefore = (await theToken.soldTokens());
        const totalBefore = (await theToken.totalSupply());
        const presaleAmount = new BigNumber(web3.toWei(1000, "ether"));
        // fails from others than the token assignment control account
        await theToken.addPresaleAmount(user1, presaleAmount).should.be.rejectedWith(revert);
        const callResult = await theToken.addPresaleAmount(user1, presaleAmount, {from: expectedTokenAssignmentControl}).should.not.be.rejected;
        const expTxEvent = callResult.logs[0];
        expTxEvent.event.should.be.equal('Transfer');
        expTxEvent.args.from.should.be.equal(expectedReserves); // on this specific token contract!
        expTxEvent.args.to.should.be.equal(user1);
        expTxEvent.args.value.should.be.bignumber.equal(presaleAmount);
        (await theToken.balanceOf(user1)).should.be.bignumber.equal(balanceBefore.plus(presaleAmount));
        (await theToken.balanceOf(expectedReserves)).should.be.bignumber.equal(reservesBefore.minus(presaleAmount));
        (await theToken.soldTokens()).should.be.bignumber.equal(soldBefore.plus(presaleAmount));
        (await theToken.totalSupply()).should.be.bignumber.equal(totalBefore);
        // addPresaleAmount should not allow integer overflow! We try with a value that would overflow to 1
        const targetedHugeAmount = (new BigNumber(2)).pow(256).minus(balanceBefore.plus(presaleAmount)).plus(1);
        await theToken.addPresaleAmount(user1, targetedHugeAmount, {from: expectedTokenAssignmentControl}).should.be.rejectedWith(EVMThrow);
        (await theToken.balanceOf(user1)).should.be.bignumber.equal(balanceBefore.plus(presaleAmount));
    });

    it("should fail handing out more presale coins than the total supply.", async function () {
        let theToken = await TokenContract.deployed();
        const presaleAmount = (await theToken.totalSupply()).minus(await theToken.soldTokens()).plus(1);
        await theToken.addPresaleAmount(user2, presaleAmount, {from: expectedTokenAssignmentControl}).should.be.rejectedWith(revert);
    });

    it("should allow setting referrals.", async function () {
        let theToken = await TokenContract.deployed();
        // referral doesn't work if both are the same or only one of the users is whitelisted
        await theToken.addReferral(user2, user2, {from: expectedWhitelist}).should.be.rejectedWith(revert);
        await theToken.addReferral(user1, user2, {from: expectedWhitelist}).should.be.rejectedWith(revert);
        await theToken.addReferral(user2, user1, {from: expectedWhitelist}).should.be.rejectedWith(revert);
        await theToken.addToWhitelist(user2, {from: expectedWhitelist}).should.not.be.rejected;
        let isUser2Whitelisted = await theToken.whitelist(user2);
        isUser2Whitelisted.should.equal(true);
        // fails with "any" account, succeeds with correct account
        await theToken.addReferral(user1, user2).should.be.rejectedWith(revert);
        const callResult = await theToken.addReferral(user1, user2, {from: expectedWhitelist}).should.not.be.rejected;
        const expReferEvent = callResult.logs[0];
        expReferEvent.event.should.be.equal('Referred');
        expReferEvent.args.parent.should.be.equal(user1);
        expReferEvent.args.child.should.be.equal(user2);
        // cannot add referral to the same user from a different whitelisted user
        await theToken.addToWhitelist(user3, {from: expectedWhitelist}).should.not.be.rejected;
        let isUser3Whitelisted = await theToken.whitelist(user3);
        isUser3Whitelisted.should.equal(true);
        await theToken.addReferral(user3, user2, {from: expectedWhitelist}).should.be.rejectedWith(revert);
    });

    it("should pay referral amount on adding presale amount.", async function () {
        let theToken = await TokenContract.deployed();
        const presaleAmount = new BigNumber(1000);
        const callResult = await theToken.addPresaleAmount(user2, presaleAmount, {from: expectedTokenAssignmentControl}).should.not.be.rejected;
        const expTxEvent1 = callResult.logs[0];
        expTxEvent1.event.should.be.equal('Transfer');
        expTxEvent1.args.from.should.be.equal(expectedReserves); // on this specific token contract!
        expTxEvent1.args.to.should.be.equal(user2);
        const mainTokenAmount = expTxEvent1.args.value;
        const expTxEvent2 = callResult.logs[1];
        expTxEvent2.event.should.be.equal('Transfer');
        expTxEvent2.args.from.should.be.equal(expectedReserves); // on this specific token contract!
        expTxEvent2.args.to.should.be.equal(user1);
        expTxEvent2.args.value.should.be.bignumber.equal(mainTokenAmount.times(5).div(100).toFixed(0));
    });

    it("should accept stopping presale.", async function () {
        let theToken = await TokenContract.deployed();
        (await theToken.presaleFinished()).should.be.equal(false);
        await theToken.finishPresale().should.be.rejectedWith(revert);
        await theToken.finishPresale({from: expectedStateControl}).should.not.be.rejected;
        (await theToken.presaleFinished()).should.be.equal(true);
    });

    it("should reject adding a presale amount after presale.", async function () {
        let theToken = await TokenContract.deployed();
        const balanceBefore = (await theToken.balanceOf(user2));
        const presaleAmount = 1000;
        // fails from others than the token assignment control account
        await theToken.addPresaleAmount(user2, presaleAmount, {from: expectedTokenAssignmentControl}).should.be.rejectedWith(revert);
        (await theToken.balanceOf(user2)).should.be.bignumber.equal(balanceBefore);
    });

    it("should allow setting allowance and allowed user to transferFrom() the tokens.", async function () {
        let theToken = await TokenContract.deployed();
        const approveAmount = (new BigNumber(web3.toWei(0.1, "ether")));
        const callResult = await theToken.approve(user2, approveAmount, {from: user1}).should.not.be.rejected;
        const expAllowEvent = callResult.logs[0];
        expAllowEvent.event.should.be.equal('Approval');
        expAllowEvent.args.owner.should.be.equal(user1);
        expAllowEvent.args.spender.should.be.equal(user2);
        expAllowEvent.args.value.should.be.bignumber.equal(approveAmount);
        (await theToken.allowance(user1, user2)).should.be.bignumber.equal(approveAmount);
    });

    it("should allow to transferFrom() the allowed tokens.", async function () {
        let theToken = await TokenContract.deployed();
        const approveAmount = (await theToken.allowance(user1, user2));
        const preBalanceUser1 = (await theToken.balanceOf(user1));
        const preBalanceUser2 = (await theToken.balanceOf(user2));
        preBalanceUser1.should.be.bignumber.above(approveAmount);
        // Sending to wrong users, too high amounts, or from others than the recipient fails.
        await theToken.transferFrom(user1, user3, approveAmount, {from: user3}).should.be.rejectedWith(EVMThrow);
        await theToken.transferFrom(user1, user2, approveAmount.plus(1), {from: user2}).should.be.rejectedWith(EVMThrow);
        await theToken.transferFrom(user1, user2, approveAmount).should.be.rejectedWith(EVMThrow);
        const callResult = await theToken.transferFrom(user1, user2, approveAmount, {from: user2}).should.not.be.rejected;
        const expTxEvent = callResult.logs[0];
        expTxEvent.event.should.be.equal('Transfer');
        expTxEvent.args.from.should.be.equal(user1);
        expTxEvent.args.to.should.be.equal(user2);
        expTxEvent.args.value.should.be.bignumber.equal(approveAmount);
        (await theToken.balanceOf(user1)).should.be.bignumber.equal(preBalanceUser1.minus(approveAmount));
        (await theToken.balanceOf(user2)).should.be.bignumber.equal(preBalanceUser2.plus(approveAmount));
        await theToken.transferFrom(user1, user2, 1, {from: user2}).should.be.rejectedWith(EVMThrow);
    });

    it("should allow to transfer tokens to the token address.", async function () {
        let theToken = await TokenContract.deployed();
        const preBalanceUser = (await theToken.balanceOf(user2));
        const preBalanceToken = (await theToken.balanceOf(theToken.address));
        preBalanceUser.should.be.bignumber.above(0);
        preBalanceToken.should.be.bignumber.equal(0);
        // Sending to wrong users, too high amounts, or from others than the recipient fails.
        const callResult = await theToken.transfer(theToken.address, preBalanceUser, {from: user2}).should.not.be.rejected;
        const expTxEvent = callResult.logs[0];
        expTxEvent.event.should.be.equal('Transfer');
        expTxEvent.args.from.should.be.equal(user2);
        expTxEvent.args.to.should.be.equal(theToken.address);
        expTxEvent.args.value.should.be.bignumber.equal(preBalanceUser);
        (await theToken.balanceOf(user2)).should.be.bignumber.equal(0);
        (await theToken.balanceOf(theToken.address)).should.be.bignumber.equal(preBalanceToken.plus(preBalanceUser));
        await theToken.transfer(theToken.address, 1, {from: user2}).should.be.rejectedWith(EVMThrow);
    });

    it("should allow rescuing tokens wrongly assigned to its own address.", async function () {
        let theToken = await TokenContract.deployed();
        const preBalanceUser = (await theToken.balanceOf(user1));
        const preBalanceToken = (await theToken.balanceOf(theToken.address));
        await theToken.rescueToken(theToken.address, user1).should.be.rejectedWith(revert);
        const callResult = await theToken.rescueToken(theToken.address, user1, {from: expectedTokenAssignmentControl}).should.not.be.rejected;
        const expTxEvent = callResult.logs[0];
        expTxEvent.event.should.be.equal('Transfer');
        expTxEvent.args.from.should.be.equal(theToken.address);
        expTxEvent.args.to.should.be.equal(user1);
        expTxEvent.args.value.should.be.bignumber.equal(preBalanceToken);
        (await theToken.balanceOf(theToken.address)).should.be.bignumber.equal(0);
        (await theToken.balanceOf(user1)).should.be.bignumber.equal(preBalanceToken.plus(preBalanceUser));
    });

    // modifiers should reject out of range values

});

