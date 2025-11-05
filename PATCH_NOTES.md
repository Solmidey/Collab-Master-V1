# Patch Notes

## Updated Files & Highlights

- `contracts/EscrowV2.sol`, `contracts/Anchors.sol`: Added non-custodial escrow with EIP-712 signature validation, timelock refunds, dispute locking, and lightweight audit anchoring contract.
- `test/EscrowV2.ts`: Hardhat tests covering deposits, signature-gated releases, disputes, and timelock refunds.
- `packages/backend/**`: New backend services for milestones, disputes, IPFS pinning, audit logs, treasury sweeps, and jobs (`milestoneWatchdog`, `treasurySweep`, `anchorLogs`). Includes Express routes for deals and disputes plus Jest tests.
- `packages/bot/src/commands/*`: Added `/deposit`, `/acceptmilestone`, and `/opendispute` command handlers with integration tests simulating end-to-end flows.
- `src/interactions/modals.ts`, `src/commands/collab.ts`: Hardened channel resolution so mod review posts reliably reach the configured guild channels.
- `README.md`, `.env.example`: Documented new env vars, multisig workflow, and background jobs.
- `package.json`: Added Hardhat/Jest tooling and scripts (`test`, `test:contracts`, `test:backend`, `test:bot`).

## Usage

- Run `npm run test` to execute Solidity, backend, and bot integration suites.
- Schedule `packages/backend/src/jobs/milestoneWatchdog.ts`, `treasurySweep.ts`, and `anchorLogs.ts` as recurring tasks for automation.
