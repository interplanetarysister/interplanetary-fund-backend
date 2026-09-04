# Canonical Repository Transition — Historical Record / Current Correction

## Current production decision — September 4, 2026

Interplanetary Fund remains one cohesive product with coordinated repositories, but the August 25 ownership model recorded in earlier revisions of this file has been superseded.

### Current canonical production repositories

1. `interplanetarysister/interplanetary-fund2` — canonical user-facing Base44 / React+Vite application layer.
2. `interplanetarysister/InterplanetaryFund` — authoritative Convex backend and internal-agent runtime, including persistent agent state/memory, permissions, orchestration, scheduled intelligence, treasury/payments backend, and backend protocol.

### Legacy/reference repository

`interplanetarysister/interplanetary-fund-backend` — **this repository** — is legacy/reference only unless explicitly reassigned by the owner. It must not become a second production backend source of truth.

## Why this file changed

An earlier August 25 architecture named `InterplanetaryFund` as the frontend and this repository as the authoritative backend. Later owner-authorized architecture reversed that consolidation direction and established `interplanetary-fund2` as the user-facing application and `InterplanetaryFund` as the canonical backend/runtime.

This correction is intentionally preserved in place so agents do not continue acting on stale architecture.

## Source-of-truth rules

- User-facing application behavior belongs in `interplanetary-fund2`.
- Authoritative Convex/backend/runtime behavior belongs in `InterplanetaryFund`.
- This repository is evidence/reference for prior capabilities until each unique production-relevant capability is reconciled.
- Live campaign/user/donation/agent/business state must have one canonical source of truth.
- Cross-repository behavior is integrated through explicit APIs/functions/contracts, not by copying live-state authority.
- Secrets and credentials are never copied as source files during migration.

## Capability migration rule

When this repository contains a unique useful capability:

1. inspect the current canonical application and backend implementations first;
2. determine whether the historical capability is still required;
3. migrate only the missing portion into the repository that owns it;
4. preserve stable identities/contracts where appropriate;
5. verify authorization, security, payments/financial semantics, idempotency, data integrity, tests, and deployment;
6. document the migration before retiring the historical source.

## Release rule

A capability is complete only when every affected **current canonical** repository, interface, permission boundary, deployment configuration, and operational consumer is compatible and the end-to-end behavior is verified.

## Retirement policy

Do not delete or archive this repository until a capability/provenance/security audit confirms every unique production-relevant item has been migrated, preserved as historical evidence, or explicitly retired with owner approval.
