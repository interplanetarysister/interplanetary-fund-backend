# Interplanetary Fund — Product System Contract (Legacy Repository Reference)

**Current status:** This repository is historical/reference only unless explicitly reassigned by the owner.
**Current architecture effective:** 2026-09-04

Interplanetary Fund is one cohesive product implemented across coordinated repositories. Repositories are implementation boundaries, not separate products.

## Current canonical repositories

- `interplanetarysister/interplanetary-fund2` — canonical user-facing Base44 / React+Vite application layer.
- `interplanetarysister/InterplanetaryFund` — authoritative Convex backend and internal-agent runtime.
- `interplanetarysister/interplanetary-fund-backend` — legacy/reference source. Unique production-relevant capabilities must be reconciled into the current canonical repositories; this repository is not an independent production source of truth.

## Historical note

Older revisions of this contract named `InterplanetaryFund` as the frontend and this repository as the authoritative backend. That August 2026 arrangement is superseded by the current owner-authorized repository boundary. Preserve the history, but do not implement new production architecture here based on the older wording.

## Single live product rule

A campaign, user, donation, connection, agent state, administrative state, or other live business object has one canonical live identity. It must not be duplicated into repository-local production databases merely because more than one repository consumes it.

Git repositories contain implementations and historical evidence. The authoritative Convex/backend runtime in `InterplanetaryFund` owns canonical backend state; `interplanetary-fund2` consumes/exposes it through approved application interfaces.

## Cross-repository feature rule

Every feature is treated as one product capability. A change must be classified as application-only, backend/runtime-only, or cross-repository. Cross-repository capabilities require compatible changes to all affected current consumers, interfaces, permissions, and operational monitoring before being considered complete.

## Campaign consistency invariant

For every campaign ID:

- authorized creation from the application resolves to the canonical backend record;
- admin and agent surfaces read the same authoritative record where permitted;
- edits update the canonical record rather than creating a competing production copy;
- campaign status, funding totals, permissions, audit history, and connected-platform state reconcile to the same source of truth;
- every authorized surface converges on the same current state.

## Migration rule from this legacy repository

When moving a capability from `interplanetary-fund-backend`:

- compare it with current `InterplanetaryFund` and `interplanetary-fund2` implementations first;
- preserve useful behavior unless intentionally superseded;
- place user-facing/application behavior in `interplanetary-fund2`;
- place authoritative backend/runtime behavior in `InterplanetaryFund`;
- do not migrate secrets, credentials, obsolete competing stores, or stale architecture assumptions;
- document origin and destination;
- verify imports, environment variables, schemas, APIs, permissions, financial behavior, idempotency, and deployment in the destination.

## Completion checklist for migrated capabilities

- [ ] current canonical owner identified
- [ ] existing destination implementation inspected
- [ ] unique missing behavior identified
- [ ] stable entity IDs/contracts preserved where required
- [ ] application consumer updated if applicable
- [ ] backend/runtime updated if applicable
- [ ] permissions/security verified
- [ ] financial/idempotency boundaries verified where applicable
- [ ] shared interfaces compatible
- [ ] environment/deployment configuration checked
- [ ] end-to-end behavior verified
- [ ] no competing production source of truth introduced
- [ ] historical provenance retained until retirement is approved
