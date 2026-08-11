# Mobile App Build Guide

## Overview
The Interplanetary Fund mobile app is built using Capacitor to wrap the React web app
as a native Android application. The `android/` project is committed to the repository
and is ready to build after installing dependencies and syncing assets.

## Prerequisites
- Node.js 18+
- Android Studio with Android SDK (API 22+)
- JDK 17+
- `VITE_CONVEX_URL` environment variable set

## First-Time Setup (android/ already exists in repo)

```bash
# Install Node dependencies
npm install

# Build the web app
npm run build

# Sync web assets into the Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```

> If you need to regenerate the Android project from scratch:
> ```bash
> npx cap add android
> npx cap sync android
> ```

## Build & Sync (routine updates)

```bash
# 1. Build the web app
npm run build

# 2. Sync web build to native project
npx cap sync android

# 3. Open in Android Studio (optional)
npx cap open android
```

## Producing the APK

### Method 1: Android Studio
1. Run `npm run build && npx cap sync android`
2. Run `npx cap open android`
3. In Android Studio: Build -> Build Bundle(s)/APK(s) -> Build APK(s)
4. APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Method 2: Command Line (one command)
```bash
npm run mobile:build:apk
# Equivalent to: npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
# APK output: android/app/build/outputs/apk/debug/app-debug.apk

# Release build (requires keystore):
cd android && ./gradlew assembleRelease
# APK output: android/app/build/outputs/apk/release/app-release.apk
```

## Environment Configuration

### Development
Create `.env.local`:
```
VITE_CONVEX_URL=https://rosy-butterfly-2.convex.cloud
```

### Production (Vercel web)
Set `VITE_CONVEX_URL` in Vercel project settings -> Environment Variables.

### Mobile (Capacitor Android)
The Convex URL is bundled into `dist/` at build time via `VITE_CONVEX_URL`.
Ensure the variable is set before running `npm run build`.

## Updating the App

1. Make code changes
2. `npm run build` — rebuilds web app
3. `npx cap sync android` — copies new build to Android project
4. Rebuild APK in Android Studio or via `cd android && ./gradlew assembleDebug`
5. Push to GitHub -> Vercel auto-deploys web version

## Vite Base Path

`vite.config.ts` sets `base: "/"`. This is correct for:
- Vercel (serves app from root `/`)
- Capacitor Android (WebView loads from `file://` or bundled assets with root-relative paths)

Do NOT change this to a GitHub Pages sub-path unless specifically deploying to GitHub Pages.

## iOS

iOS support is configured in `capacitor.config.ts` but the `ios/` native project has not
been initialized in this repository. To add iOS support (requires macOS + Xcode):

```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```
