import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, parseEther, zeroAddress } from "viem";
import { network } from "hardhat";

test("BasicAccount: owner set and onlyOwner enforced", async () => {
  const { viem } = await network.connect();
  const [owner, attacker] = await viem.getWalletClients();

  const account = await viem.deployContract("BasicAccount", [owner.account.address]);

  // owner read (normalize case)
  assert.equal(
    (await account.read.owner()).toLowerCase(),
    owner.account.address.toLowerCase(),
  );

  // attacker cannot execute
  const counter = await viem.deployContract("Counter", []);
  const data = encodeFunctionData({ abi: counter.abi, functionName: "inc" });

  await assert.rejects(
    () =>
      account.write.execute([counter.address, 0n, data], {
        account: attacker.account,
      }),
    /NotOwner|NotOwner\(\)/,
  );
});

test("BasicAccount: execute can call target contract", async () => {
  const { viem } = await network.connect();
  const [owner] = await viem.getWalletClients();

  const account = await viem.deployContract("BasicAccount", [owner.account.address]);
  const counter = await viem.deployContract("Counter", []);

  const data = encodeFunctionData({ abi: counter.abi, functionName: "inc" });

  await account.write.execute([counter.address, 0n, data], { account: owner.account });

  const num = await counter.read.x();
  assert.equal(num, 1n);
});

test("BasicAccount: revert bubbles with CallFailed(revertData)", async () => {
  const { viem } = await network.connect();
  const [owner] = await viem.getWalletClients();

  const account = await viem.deployContract("BasicAccount", [owner.account.address]);
  const counter = await viem.deployContract("Counter", []);

  const data = encodeFunctionData({ abi: counter.abi, functionName: "willRevert" });

  await assert.rejects(
    () => account.write.execute([counter.address, 0n, data], { account: owner.account }),
    /CallFailed/,
  );
});

test("BasicAccount: can receive ETH and send ETH via execute", async () => {
  const { viem } = await network.connect();
  const [owner, recipient] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const account = await viem.deployContract("BasicAccount", [owner.account.address]);

  // fund the account
  await owner.sendTransaction({
    to: account.address,
    value: parseEther("1"),
  });

  const before = await publicClient.getBalance({ address: recipient.account.address });

  // send 0.1 ETH to recipient via execute
  await account.write.execute([recipient.account.address, parseEther("0.1"), "0x"], {
    account: owner.account,
  });

  const after = await publicClient.getBalance({ address: recipient.account.address });
  assert.ok(after > before);
});

test("BasicAccount: setOwner works, rejects zero address", async () => {
  const { viem } = await network.connect();
  const [owner, newOwner] = await viem.getWalletClients();

  const account = await viem.deployContract("BasicAccount", [owner.account.address]);

  await account.write.setOwner([newOwner.account.address], { account: owner.account });

  assert.equal(
    (await account.read.owner()).toLowerCase(),
    newOwner.account.address.toLowerCase(),
  );

  await assert.rejects(
    () => account.write.setOwner([zeroAddress], { account: newOwner.account }),
    /ZeroOwner|ZeroOwner\(\)/,
  );
});
