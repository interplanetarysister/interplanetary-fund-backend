# Canonical Repository Transition

## Current production decision — August 25, 2026

Interplanetary Fund is one cohesive product with multiple coordinated repositories.

### Canonical production repositories

1. `interplanetarysister/InterplanetaryFund` — authoritative user-facing React/Vite frontend.
2. `interplanetarysister/interplanetary-fund-backend` — authoritative backend, admin monitoring, agent runtime, security, treasury, scheduled jobs, and operational infrastructure.

### Migration/reference repository

`interplanetarysister/interplanetary-fund` is a migration/reference source. It may contain capabilities that have not yet been reconciled into the canonical repositories. It is not an independent production product.

## Source-of-truth rules

- The frontend source of truth is `InterplanetaryFund`.
- Backend and operations source of truth is `interplanetary-fund-backend`.
- Live campaign/user/donation/business state has one canonical backend source of truth and is never split by repository.
- Cross-repository behavior is integrated through explicit APIs/shared backend contracts, not by treating repositories as separate products.
- Historical code may be migrated after capability comparison and compatibility review.
- Secrets and credentials are never copied as source files during migration.

## Campaign invariant

A campaign created or changed from any authorized product surface retains one stable campaign ID and resolves to the same canonical live record. The user frontend, admin cockpit, agents, analytics, payment/treasury services, and integrations must converge on that record.

## Release rule

A feature is complete only when every affected canonical repository, contract, permission boundary, deployment configuration, and operational consumer is compatible and the end-to-end behavior is verified.

## Retirement policy

Do not delete or archive `interplanetary-fund` until a capability audit confirms every unique production-relevant capability has either been migrated into the canonical repositories or explicitly retired.
