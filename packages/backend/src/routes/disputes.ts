import express from "express";
import { z } from "zod";

import type { DealService } from "../services/dealService.js";

export function createDisputesRouter(dealService: DealService) {
  const router = express.Router();

  router.post("/:milestoneId/open", (req, res, next) => {
    try {
      const schema = z.object({ openedBy: z.string(), description: z.string().optional() });
      const parsed = schema.parse(req.body);
      const dispute = dealService.openDispute(req.params.milestoneId, parsed.openedBy, parsed.description);
      res.json({ dispute });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:disputeId/evidence", (req, res, next) => {
    try {
      const schema = z.object({
        ipfsHash: z.string(),
        checksum: z.string(),
        submittedBy: z.string(),
        description: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const dispute = dealService.addEvidence(req.params.disputeId, parsed);
      res.json({ dispute });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:disputeId/escalate", (req, res, next) => {
    try {
      const dispute = dealService.escalateToArbitrator(req.params.disputeId);
      res.json({ dispute });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:disputeId/resolve", (req, res, next) => {
    try {
      const schema = z.object({
        decision: z.enum(["release", "refund", "split"]),
        details: z.string(),
        resolvedBy: z.string(),
      });
      const parsed = schema.parse(req.body);
      const dispute = dealService.resolveDispute(
        req.params.disputeId,
        parsed.decision,
        parsed.details,
        parsed.resolvedBy
      );
      res.json({ dispute });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
