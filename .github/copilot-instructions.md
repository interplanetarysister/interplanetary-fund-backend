# GitHub Copilot Instructions — Interplanetary Fund

## Project Overview
The Interplanetary Fund is a woman-owned fundraising platform built by Michelle Rogers. It streamlines fundraising, manages donor relationships, and maximizes campaign impact through AI agents and real-time insights. The platform is a React/Vite frontend deployed on Vercel, a Convex cloud backend, and a Capacitor Android wrapper for the mobile APK.

## Architecture — THREE Components

### 1. React Frontend (`src/`)
- **Framework**: React + Vite + Tailwind CSS
- **Hosting**: Vercel (auto-deploy from GitHub)
- **Mobile**: Capacitor Android wrapper (`android/`)
- **Purpose**: Full application UI — campaigns, treasury, agents, admin

### 2. Convex Backend (`convex/`)
- **URL**: https://rosy-butterfly-2.convex.cloud
- **REST API**: POST https://rosy-butterfly-2.convex.cloud/api/query
- **Purpose**: Source of truth for all application data — analytics, protocol enforcement, treasury, agents
- **Data Tables**: See `convex/schema.ts` for the full active table list (includes treasury, donations, user/admin, platform, and inbox/posting data).
- **Crons**: Daily 6am audit, weekly Saturday 2am training

### 3. Capacitor Android (`android/`)
- **Framework**: Capacitor 6 wrapping the React web app
- **Config**: `capacitor.config.ts`
- **Build**: `npm run mobile:build:apk` (web build + cap sync + gradlew assembleDebug)
- **Output**: `android/app/build/outputs/apk/debug/app-debug.apk`

## Data Flow
```
GitHub push
  -> Vercel auto-deploy (web)
  -> npm run build + cap sync + gradlew (Android APK)
  -> Both targets connect to Convex Cloud via VITE_CONVEX_URL
```

## 7 AI Agents (stored in Convex)

| Agent | Role | Specialization |
|-------|------|----------------|
| Fundraising Agent | fundraising | Campaign optimization |
| Story Agent | story | Narrative crafting |
| Donor Relations Agent | donor_relations | Donor engagement |
| Protocol Agent | protocol | Compliance enforcement |
| Analytics Agent | analytics | Revenue projection |
| Treasury Agent | treasury | Fee & payout management |
| Platform Sync Agent | platform_sync | External integration |

## 5 Campaigns (stored in Convex)
| Campaign | Status | Category | Goal |
|----------|--------|----------|------|
| Running against the wind | draft | disaster_relief | $5,000 |
| Random tester | active | creative | $1,000 |
| Help | active | emergency | $5,000 |
| Woman with a dream | active | business | $50,000 |
| Help homeless get a conversion van | draft | housing | $10,000 |

## 11 Platform Connections (stored in Convex)
Bluesky, Patreon, Facebook, Ko-fi, Buy Me a Coffee, Spotfund, FundRazr, Indiegogo, GiveSendGo, Kickstarter, GoFundMe

## Convex Backend Files
- `convex/schema.ts` — Full active Convex data schema
- `convex/agents.ts` — Agent CRUD, stats, memory updates
- `convex/campaigns.ts` — Campaign sync, platform connections
- `convex/treasury.ts` — Fees, payouts, balance aggregation
- `convex/protocol.ts` — P-1 through P-8 enforcement, auto-fix
- `convex/crons.ts` — Daily audit + weekly training
- `convex/seed.ts` — Seeds real campaign and agent data

## Banking Implementation Status (Repo-Verified)
- Donation intent + confirmation flows are implemented in `convex/paymentRouter.ts` and `convex/paypalCheckout.ts`.
- Treasury fee math, deposits, payout requests, and payout completion are implemented in `convex/treasury.ts`.
- Campaign-level withdrawal queueing and admin payout confirmation are implemented in `convex/simpleWithdraw.ts` and `convex/withdrawalMethods.ts`.
- Admin fraud review/freeze workflows for payouts are implemented in `convex/fraudControl.ts`.
- Scheduled fund migration and external balance checks are implemented via `convex/fundMigration.ts` + `convex/crons.ts`.
- There is currently no dedicated `convex/webhooks.ts` file or `convex/http.ts` webhook router in this repository.

## Protocol Standards (P-1 through P-8)
- P-1: outreach_enabled = true
- P-2: payment_active = true
- P-3: story_present = true
- P-4: cover_image_present = true
- P-5: ai_ideal_donors or ai_interested_orgs not empty
- P-6: Daily protocol audit enforced via cron
- P-7: Gross-to-net fee calculation for all deposits
- P-8: Batch payout processing with fee deduction

## Key Conventions
- All currency values stored as floats (USD)
- Dates in ISO 8601 format
- Agent scores: trustScore, reliabilityScore, efficiencyScore (0-100)
- Campaign status: "active" | "draft" | "completed" | "archived"
- Mobile-first: all UI must work on Galaxy A16 (360x800 viewport)
- Dark theme with agent-specific accent colors

## Build Commands
- `npm run dev` — local development
- `npm run build` — production web build to dist/
- `npm run preview` — preview production build
- `npx convex dev` — run Convex backend locally
- `npx convex deploy` — deploy Convex to production
- `npx cap sync android` — sync web build to Android project
- `npx cap open android` — open Android Studio
- `npm run mobile:build:apk` — full APK build pipeline

## Environment Variables
- `VITE_CONVEX_URL` — Convex deployment URL (https://rosy-butterfly-2.convex.cloud)
- `VITE_PAYPAL_BUSINESS_EMAIL` — optional, PayPal payment display
- `VITE_CASHAPP_CASHTAG` — optional, CashApp payment display

## Migration Note
The platform was originally prototyped on Base44. All data and logic have been migrated
to Convex. Historical Base44 reference files in `base44-functions/` and `base44-sync/`
are preserved for context but are not part of the active build or deployment.

## Universal GitHub deletion handoff rule
This rule applies to **all GitHub work in this repository**, regardless of which human, Agent 1/2/3, Codex agent, Copilot agent, workflow agent, automation, reviewer, or other authorized contributor performs the work.

When work identifies a file, workflow, branch artifact, duplicate, obsolete configuration, repository artifact, or other GitHub item that is safe and ready for deletion, first verify that it has no required dependency, active deployment use, or unique required content. If the acting agent/contributor has authority and tooling to delete it safely, perform the deletion. If it cannot perform the deletion itself, leave a comment at the bottom of the relevant issue, pull request, review, or durable work record in this format:

`✨🌟 DELETION READY: <exact item/path> — <brief verified reason it is safe to delete> 🌟✨`

The star marker means verified deletion-ready; it must not be used merely for suspected cleanup. This rule applies to every GitHub task, not only agent workflows or consolidation work.