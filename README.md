# Interplanetary Fund Backend — Legacy / Reference Repository

> **Current status (2026-09-04): LEGACY / REFERENCE ONLY unless explicitly reassigned by the owner.**

This repository contains historical backend, admin, agent, security, treasury, payment, mobile, and operational implementation that remains useful for capability comparison and migration evidence. It is **not** the current production backend source of truth.

## Current canonical repository ownership

| Repository | Current role | Production authority |
|---|---|---|
| `interplanetarysister/interplanetary-fund2` | User-facing Base44 / React+Vite application | Canonical application layer |
| `interplanetarysister/InterplanetaryFund` | Convex backend + internal-agent runtime | Canonical backend/runtime |
| `interplanetarysister/interplanetary-fund-backend` | Historical backend/reference snapshot | **No new production architecture** |

## What this repository is for now

- capability/reference audits before retirement;
- provenance and historical implementation evidence;
- comparing old payment, migration, admin, agent, mobile, and operational behavior with the current canonical implementation;
- identifying unique production-relevant behavior that has not yet been migrated;
- preserving legally/security-relevant history until reviewed.

## Migration rule

Do **not** continue implementing new production backend features here by default.

When a useful capability exists only here:

1. compare it against current `InterplanetaryFund` backend/runtime behavior and `interplanetary-fund2` application behavior;
2. determine whether it is still required;
3. migrate only the missing behavior to the repository that currently owns it;
4. use explicit application/backend interfaces rather than copying live-state ownership;
5. do not migrate secrets or credentials;
6. verify authorization, data integrity, financial semantics, idempotency, tests, and deployments in the destination repository;
7. retain this repository as historical evidence until the migration/retirement audit is complete.

## Important historical-document warning

Older files in this repository may call this repository the authoritative backend and may call `InterplanetaryFund` the frontend. Those statements describe an earlier architecture and are superseded by the current owner-authorized September 2026 repository boundary.

`CANONICAL_REPO_TRANSITION.md` and `PRODUCT_SYSTEM_CONTRACT.md` have been updated to preserve the historical record while reflecting the current role.

## Safety

Do not delete or archive this repository merely because it is legacy. First verify that every unique production-relevant capability, security finding, documentation requirement, and provenance record has either been migrated, preserved, or intentionally retired with owner approval.
