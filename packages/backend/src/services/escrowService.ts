import { ethers } from "ethers";

import type { AuditLogService } from "./auditLogService.js";

export interface EscrowContractAdapter {
  address: string;
  chainId: number;
  getNonce(): Promise<bigint>;
  release(
    recipients: string[],
    amounts: bigint[],
    signatures: string[]
  ): Promise<{ hash: string }>;
}

export interface ReleasePayload {
  domain: ethers.TypedDataDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: {
    recipientsHash: string;
    amountsHash: string;
    nonce: bigint;
  };
}

export interface EscrowReleaseOptions {
  contract: EscrowContractAdapter;
  recipients: string[];
  amounts: bigint[];
  signers: ethers.Signer[];
  safeAddress?: string;
}

export class MissingControllerKeyError extends Error {
  constructor() {
    super("ESCROW_CONTROLLER_PRIVATE_KEY env var is required for direct release operations");
  }
}

export class EscrowService {
  private readonly controllerWallet?: ethers.Wallet;

  constructor(
    private readonly provider: ethers.Provider,
    private readonly auditLogService: AuditLogService,
    private readonly safeHook?: (safeAddress: string, payload: ReleasePayload) => Promise<void>
  ) {
    const key = process.env.ESCROW_CONTROLLER_PRIVATE_KEY;
    if (key) {
      this.controllerWallet = new ethers.Wallet(key, provider);
    }
  }

  buildReleasePayload(
    contract: EscrowContractAdapter,
    recipients: string[],
    amounts: bigint[],
    nonce: bigint
  ): ReleasePayload {
    const recipientsHash = ethers.solidityPackedKeccak256(
      recipients.map(() => "address"),
      recipients
    );
    const amountsHash = ethers.solidityPackedKeccak256(amounts.map(() => "uint256"), amounts);
    return {
      domain: {
        name: "MomentumEscrow",
        version: "2",
        chainId: contract.chainId,
        verifyingContract: contract.address,
      },
      types: {
        Release: [
          { name: "recipientsHash", type: "bytes32" },
          { name: "amountsHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
        ],
      },
      message: {
        recipientsHash,
        amountsHash,
        nonce,
      },
    };
  }

  async collectSignatures(
    payload: ReleasePayload,
    signers: ethers.Signer[],
    nonce: bigint
  ): Promise<string[]> {
    const toSign = { ...payload, message: { ...payload.message, nonce } };
    return Promise.all(signers.map((signer) => signer.signTypedData(toSign.domain, toSign.types, toSign.message)));
  }

  async release({ contract, recipients, amounts, signers, safeAddress }: EscrowReleaseOptions): Promise<{
    txHash?: string;
    safeRequestId?: string;
  }> {
    if (recipients.length !== amounts.length) {
      throw new Error("Recipients and amounts length mismatch");
    }
    const nonce = await contract.getNonce();
    const payload = this.buildReleasePayload(contract, recipients, amounts, nonce);

    if (safeAddress && (!this.controllerWallet || process.env.ESCROW_REQUIRE_SAFE === "true")) {
      this.auditLogService.append("escrow.release.safe_enqueued", {
        contract: contract.address,
        safeAddress,
        recipients,
        amounts: amounts.map((value) => value.toString()),
      });
      if (this.safeHook) {
        await this.safeHook(safeAddress, payload);
      } else {
        this.auditLogService.append("escrow.release.safe_todo", {
          note: "TODO integrate gnosis safe service API",
        });
      }
      return { safeRequestId: `${safeAddress}:${contract.address}:${nonce.toString()}` };
    }

    if (!this.controllerWallet) {
      throw new MissingControllerKeyError();
    }

    const signatures = await this.collectSignatures(payload, signers, nonce);
    const tx = await contract.release(recipients, amounts, signatures);
    this.auditLogService.append("escrow.release.executed", {
      contract: contract.address,
      recipients,
      amounts: amounts.map((value) => value.toString()),
      txHash: tx.hash,
    });
    return { txHash: tx.hash };
  }
}
