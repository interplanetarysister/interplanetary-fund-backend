# Branch Governance

Interplanetary Fund uses `main` as the production source of truth.

## Integration rules

1. Never merge a branch solely because its name or commit message looks relevant.
2. Compare every candidate branch against current `main` before integration.
3. Treat `behind_by > 0` as a mandatory reconciliation step; do not fast-forward or overwrite `main` with a stale branch snapshot.
4. Prefer a fresh branch from current `main` and port only the reviewed, non-conflicting change when a useful branch has diverged.
5. Do not merge legacy, duplicate, temporary, or verification branches into production.
6. Production changes must retain the current React + Vite frontend, Convex backend, and Capacitor architecture.
7. Payment, treasury, authentication, and agent-orchestration changes require explicit review before integration.
8. Temporary verification branches must be reset/removed after verification so they cannot be mistaken for production candidates.

## Current audit disposition — 2026-08-25

- `main` remains canonical.
- The persistent-agent-orchestration change is already represented in current production `convex/crons.ts`; its old feature branch is stale and must not be merged wholesale.
- The old scrolling/data-access branch is divergent from current `main`; its useful work must only be ported selectively after comparison.
- Vercel analytics/speed-insights branches were created from older commits and must not overwrite current production files.
- Temporary verification branches created during the audit were reset to the current `main` commit and contain no unique production changes.
