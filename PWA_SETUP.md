# THS Operations Hub — PWA Setup

This project is configured as an installable Progressive Web App (PWA).

## What was added

- `app/manifest.ts` — app name, colors, standalone display mode, icons, start URL.
- `components/PwaRegister.tsx` — registers the service worker in supported browsers.
- `public/sw.js` — lightweight service worker intentionally configured without operational-data caching.
- `public/icons/` — 192px, 512px, maskable 512px, and Apple touch icons.
- `app/layout.tsx` — PWA metadata, Apple standalone support, theme color, and service-worker registration.

## Why there is no aggressive offline cache

THS Operations contains live hotel data. Housekeeping, room checks, breakfast, maintenance and similar information should not silently fall back to stale cached data. The service worker therefore uses the live network rather than caching app/API responses.

## Deploy

Deploy this project to Vercel normally. PWA installation requires HTTPS; Vercel provides HTTPS automatically.

## Install on iPhone / iPad

1. Open the production THS Operations URL in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Confirm **THS Operations**.

## Install on Android / desktop Chrome

Open the production URL in Chrome and choose **Install app** / **Add to Home Screen** when offered.

## Updating the app

Deploy updates to Vercel normally. Staff do not need an App Store update. The installed PWA continues to use the same production deployment.
