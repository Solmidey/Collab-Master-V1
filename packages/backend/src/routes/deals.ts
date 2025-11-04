import express from "express";
import { Wallet } from "ethers";
import { z } from "zod";

import type { DealService } from "../services/dealService.js";
import type { EscrowContractAdapter } from "../services/escrowService.js";

export function createDealsRouter(dealService: DealService, contractResolver: (dealId: string) => EscrowContractAdapter) {
  const router = express.Router();

  const depositSchema = z.object({
    amount: z.string(),
    walletAddress: z.string().optional(),
    discordId: z.string().optional(),
    cap: z.string(),
  });

  router.post("/:dealId/deposit", (req, res, next) => {
    try {
      const { dealId } = req.params;
      const parsed = depositSchema.parse(req.body);
      dealService.recordDeposit(dealId, BigInt(parsed.amount), {
        walletAddress: parsed.walletAddress,
        discordId: parsed.discordId,
        cap: BigInt(parsed.cap),
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  const acceptSchema = z.object({
    actorDiscordId: z.string(),
    actorWallet: z.string().optional(),
    signerKeys: z.array(z.string()),
  });

  router.post("/:dealId/milestones/:milestoneId/accept", async (req, res, next) => {
    try {
      const { dealId, milestoneId } = req.params;
      const parsed = acceptSchema.parse(req.body);
      const contract = contractResolver(dealId);
      const signers = parsed.signerKeys.map((key) => new Wallet(key));
      const milestone = await dealService.acceptMilestone({
        milestoneId,
        actor: { discordId: parsed.actorDiscordId, walletAddress: parsed.actorWallet },
        contract,
        signers,
      });
      res.json({ milestone });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
