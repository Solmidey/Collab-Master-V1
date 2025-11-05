import { expect } from "chai";
import { ethers } from "hardhat";

describe("EscrowV2", function () {
  async function deployFixture() {
    const [payer, signer1, signer2, recipient] = await ethers.getSigners();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const Escrow = await ethers.getContractFactory("EscrowV2");
    const escrow = await Escrow.deploy(
      payer.address,
      [signer1.address, signer2.address],
      ethers.ZeroAddress,
      BigInt(now + 3600),
      BigInt(3600)
    );
    await escrow.waitForDeployment();
    return { escrow, payer, signer1, signer2, recipient };
  }

  async function signRelease(
    escrow: any,
    signers: any[],
    recipients: string[],
    amounts: bigint[]
  ) {
    const nonce = await escrow.nonce();
    const domain = {
      name: "MomentumEscrow",
      version: "2",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await escrow.getAddress(),
    };
    const types = {
      Release: [
        { name: "recipientsHash", type: "bytes32" },
        { name: "amountsHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
      ],
    } as const;
    const recipientsHash = ethers.solidityPackedKeccak256(
      recipients.map(() => "address"),
      recipients
    );
    const amountsHash = ethers.solidityPackedKeccak256(
      amounts.map(() => "uint256"),
      amounts
    );
    const value = {
      recipientsHash,
      amountsHash,
      nonce,
    };
    const signatures = [] as string[];
    for (const signer of signers) {
      const signature = await signer.signTypedData(domain, types, value);
      signatures.push(signature);
    }
    return signatures;
  }

  it("accepts deposits and releases with signatures", async function () {
    const { escrow, payer, signer1, signer2, recipient } = await deployFixture();
    await expect(payer.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("1") }))
      .to.emit(escrow, "Deposit")
      .withArgs(payer.address, ethers.parseEther("1"));

    const recipients = [recipient.address];
    const amounts = [ethers.parseEther("1")];
    const signatures = await signRelease(escrow, [signer1, signer2], recipients, amounts);

    await expect(escrow.connect(payer).release(recipients, amounts, signatures))
      .to.emit(escrow, "Release")
      .withArgs(payer.address, recipients, amounts, ethers.parseEther("1"));
  });

  it("reverts release without proper signatures", async function () {
    const { escrow, payer, recipient } = await deployFixture();
    await payer.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("1") });
    await expect(escrow.release([recipient.address], [ethers.parseEther("1")], []))
      .to.be.reverted;
  });

  it("allows time lock refund after deadline", async function () {
    const { escrow, payer } = await deployFixture();
    await payer.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("0.5") });
    const deadline = await escrow.deadline();
    const refundWindow = await escrow.refundWindow();
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline + refundWindow)]);
    await ethers.provider.send("evm_mine", []);
    await expect(escrow.timeLockRefund(deadline))
      .to.emit(escrow, "TimeLockTriggered")
      .withArgs(payer.address, deadline);
  });

  it("blocks release when dispute is open", async function () {
    const { escrow, payer, signer1, signer2, recipient } = await deployFixture();
    await payer.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("1") });
    await escrow.connect(payer).setDisputeState(true);
    const recipients = [recipient.address];
    const amounts = [ethers.parseEther("1")];
    const signatures = await signRelease(escrow, [signer1, signer2], recipients, amounts);
    await expect(escrow.release(recipients, amounts, signatures)).to.be.revertedWithCustomError(
      escrow,
      "InDispute"
    );
  });
});
