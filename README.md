# Interplanetary Fund — Legacy Backend Snapshot

> **Repository status: LEGACY / REFERENCE ONLY**
>
> This repository is no longer the canonical production backend for Interplanetary Fund.

## Canonical repositories

- **Application:** `interplanetarysister/interplanetary-fund2`
- **Authoritative backend / agent runtime:** `interplanetarysister/InterplanetaryFund`

The canonical backend repository is the actively maintained Convex system and is the source of truth for agents, persistent agent memory, campaigns, protocol enforcement, treasury, payments, scheduled jobs, and platform intelligence.

The Base44-linked application remains in `interplanetary-fund2`. It is the user-facing application layer and communicates with the canonical Convex backend through explicit integration boundaries.

## Why this repository is retained

This repository contains an important historical implementation of the Convex backend, payment router, crowdfunding migration work, mobile build work, and earlier Base44 synchronization architecture. It is retained so that functionality can be audited, migrated, or recovered without losing project history.

**Do not add new production features here.** New backend functionality should be implemented in `InterplanetaryFund` and reviewed/merged there.

## Migration rule

If functionality exists here but not in the canonical backend, first compare the implementations and migrate the capability into `InterplanetaryFund` through a repository-local feature branch and review. Do not make `interplanetary-fund-backend` a second production source of truth.

## Historical architecture

This repository previously described itself as a full-stack React/Convex application and included Convex agent CRUD, campaign synchronization, treasury management, protocol enforcement, scheduled jobs, and Base44 synchronization. Those files remain valuable as migration/reference material, but the repository has been superseded by the actively maintained `InterplanetaryFund` backend.

## Safety

Do not delete this repository or its historical code until a capability-by-capability comparison confirms that every unique production-relevant capability has either been migrated or intentionally retired.
