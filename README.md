# Interplanetary Fund Backend

**Purpose: Backend**

Authoritative backend and operations system for the single Interplanetary Fund product.

## Product Build Contract

Interplanetary Fund is **one cohesive product implemented across coordinated repositories**. Repositories are implementation boundaries, not separate products.

### Repository purposes

| Repository | Purpose | Authority |
|---|---|---|
| `interplanetarysister/InterplanetaryFund` | **Frontend** | User-facing React/Vite application |
| `interplanetarysister/interplanetary-fund-backend` | **Backend** | Backend, admin, agents, security, treasury, operations |
| `interplanetarysister/interplanetary-fund` | **Migration** | Historical/reference source until every unique capability is reconciled |

### Build-agent rule

Every build agent, workflow, Copilot/Codex task, and human implementation must treat the three repositories as **one product**. Before changing code, identify the repository purpose and determine whether the capability is frontend-only, backend/operations-only, or cross-repository.

For cross-repository work, implement and verify the complete capability across all affected repositories. Do not create competing production sources of truth.

Live campaigns, users, donations, permissions, agent state, administrative state, and other business entities must retain one canonical live identity in this authoritative backend. Frontend and admin surfaces consume this canonical state; they must not create competing production stores.

### This repository owns

- Canonical backend services and data access
- Convex functions and shared business logic
- Admin cockpit and monitoring
- Agent runtime, orchestration, memory, and scheduling
- Security, fraud controls, protocol enforcement
- Treasury, payments, fees, payouts, and financial operations
- Scheduled jobs and operational integrations
- Backend-facing contracts consumed by the authoritative frontend

### This repository does not independently own

The user-facing frontend implementation. That belongs to `InterplanetaryFund`.

`interplanetary-fund` remains migration/reference material and must not become a second production backend.

## Release Rule

A backend change is production-complete only after affected frontend consumers, contracts, permissions, environment configuration, operational monitoring, and end-to-end flows have been verified. A successful Git push alone is not a complete product release.

See `PRODUCT_SYSTEM_CONTRACT.md` and `CANONICAL_REPO_TRANSITION.md` for authoritative rules.
