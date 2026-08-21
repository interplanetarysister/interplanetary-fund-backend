# Canonical Repository Transition

## Decision

As of August 21, 2026, Interplanetary Fund uses a two-repository production architecture:

1. `interplanetarysister/interplanetary-fund2` — user-facing Base44 application.
2. `interplanetarysister/InterplanetaryFund` — authoritative Convex backend and agent runtime.

This repository, `interplanetary-fund-backend`, is retained as a legacy/reference snapshot.

## Source-of-truth rules

- Production backend changes belong in `InterplanetaryFund`.
- Production application changes belong in `interplanetary-fund2`.
- A PR must target the same repository that owns the change.
- Cross-repository integration happens through explicit APIs/bridges, never by merging one repository's PR into another.
- Historical code in this repository may be migrated only after capability comparison and review.

## Agent system

The authoritative persistent agent state and memory live in the canonical Convex backend. The application may display or submit interactions to that backend, but it must not create a competing production source of truth.

## Retirement policy

Do not delete this repository until a capability audit confirms that all unique production-relevant functionality has been migrated or intentionally retired.
