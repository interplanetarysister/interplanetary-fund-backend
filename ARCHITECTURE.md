# Interplanetary Fund — Architecture

## System Diagram

```
GitHub Repository: interplanetarysister/interplanetary-fund-backend
  |
  +-- convex/        (Convex backend functions)
  +-- src/           (React frontend)
  +-- android/       (Capacitor Android native project)
  +-- capacitor.config.ts
  +-- vite.config.ts
  +-- vercel.json


                      GitHub Push
                          |
           +--------------+--------------+
           |                             |
           v                             v
    Vercel (Web)               Capacitor (Android)
    npm run build              npm run build
    dist/ served at /          npx cap sync android
           |                   cd android && gradlew assembleDebug
           |                             |
           v                             v
     Convex Cloud  <----------  Convex Cloud
  rosy-butterfly-2.convex.cloud
  (WebSocket + REST API)
```

## Data Flow

### Web App (Vercel)
1. Push to GitHub triggers Vercel auto-deploy
2. Vercel runs `npm run build` (Vite, `base: "/"`)
3. Vercel serves the React SPA from `dist/`
4. React app connects to Convex via WebSocket using `VITE_CONVEX_URL`
5. Real-time data sync (agents, campaigns, treasury)
6. Mutations update Convex -> triggers UI update

### Mobile App (Capacitor Android)
1. Developer runs `npm run build` -> produces `dist/`
2. `npx cap sync android` -> copies `dist/` into `android/app/src/main/assets/public/`
3. `cd android && ./gradlew assembleDebug` -> produces APK
4. APK loads the bundled web app (WebView)
5. App connects to Convex using `VITE_CONVEX_URL` bundled at build time
6. Capacitor provides native Android chrome (splash screen, status bar)

### GitHub Copilot
1. `.github/copilot-instructions.md` provides context
2. Copilot understands the full architecture
3. Can suggest changes to Convex functions, React components, or mobile config
4. Changes are committed and pushed -> auto-deploy to Vercel

---

## Protocol Enforcement (P-1 through P-8)

| Protocol | Rule | Enforcement |
|----------|------|-------------|
| P-1 | All campaigns must have outreach enabled | `protocol.ts:enforceProtocol()` |
| P-2 | All campaigns must have payment active | `protocol.ts:enforceProtocol()` |
| P-3 | All campaigns must have a story present | `protocol.ts:enforceProtocol()` |
| P-4 | All campaigns must have a cover image | `protocol.ts:enforceProtocol()` |
| P-5 | All campaigns must have a target audience | `protocol.ts:enforceProtocol()` |
| P-6 | Daily protocol audit at 6am | `crons.ts` |
| P-7 | Gross-to-net fee calculation | `treasury.ts:calculatePayout()` |
| P-8 | Batch payout processing | `treasury.ts:calculateBatchPayout()` |

## Agent Architecture

All 7 agents are stored as Convex records. This ensures:
- Zero external credit consumption for agent operations
- Full data portability
- Real-time WebSocket sync
- Cron-based automated training

| Agent | Role | Trust Score | Specialization |
|-------|------|-------------|----------------|
| Fundraising Agent | fundraising | 82 | Campaign optimization |
| Story Agent | story | 80 | Narrative crafting |
| Donor Relations Agent | donor_relations | 81 | Donor engagement |
| Protocol Agent | protocol | 90 | Compliance enforcement |
| Analytics Agent | analytics | 86 | Revenue projection |
| Treasury Agent | treasury | 88 | Fee & payout management |
| Platform Sync Agent | platform_sync | 84 | External integration |

## Security Model

- Convex: Row-level security via auth tokens (future)
- GitHub: Private repo with OAuth token access
- Vercel: Environment variable isolation
- No secrets in code — all in environment variables

## Migration History

The platform was originally prototyped using Base44 as a rapid app builder. Data and
logic have since been migrated to the Convex backend and React/Capacitor stack.
Historical Base44 reference files are preserved in `base44-functions/` and
`base44-sync/` for migration context; they are not part of the active build.
