# Branch Governance

Interplanetary Fund uses `main` as the production source of truth.

1. Compare every candidate branch against current `main` before integration.
2. If a branch is behind, reconcile it; never overwrite current `main` with a stale snapshot.
3. Port useful changes onto a fresh branch from current `main` before retiring the source branch.
4. Do not merge legacy, duplicate, temporary, or verification branches.
5. Payment, treasury, authentication, and agent-orchestration changes require explicit review.
6. If a branch has no unique production value, reset/retire it rather than carrying stale commits forward.
7. Never delete unique work until its replacement is verified.

## 2026-08-25 audit

`main` is canonical. Persistent agent scheduling and scrolling/startup fixes are already represented in production. Old analytics, startup, linkage, and scrolling branches are divergent and must not overwrite current production. `copilot/check-alt-convex-urls` contains zero unique commits relative to current `main` and is safe to retire/reset.