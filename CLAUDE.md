# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal photo-printing tool (UI copy is Vietnamese). Staff upload photos from a phone and set a quantity for each. All copies go into one shared queue, and every 9 copies become an A4 sheet laid out 3×3 (cells 6×9 cm). A Windows PC next to the printer keeps `/station` open in Chrome launched with `--kiosk-printing` (own `--user-data-dir` profile), so sheets print without a dialog. `/admin` also has a Mac setup guide using the same flags, not yet verified on a real Mac; alternatively the station saves each sheet as a PDF into a chosen folder. There is no other printer integration.

## Commands

- `npm run dev`: dev server at http://localhost:3000 (`npm run dev -- -H 0.0.0.0` to test from a phone on the LAN)
- `npm run build`: production build. Also catches Cache Components violations; see below.
- `npm run lint`, `npx tsc --noEmit`
- `npx next typegen`: regenerate route types (`RouteContext`, `PageProps`, `LayoutProps`) so `tsc` works without a build
- `npx drizzle-kit generate --name <name>`: create a SQL migration from `src/lib/db/schema.ts` into `drizzle/`
- `npx drizzle-kit migrate`: apply migrations. `drizzle.config.ts` loads `.env.local` through `@next/env`.

No test framework is set up. Env vars are listed in `.env.example`; copy it to `.env.local`.

## Stack notes

- **Next.js 16.4 + React 19.3**. APIs differ from older training data. Read `node_modules/next/dist/docs/` before using unfamiliar APIs. Middleware is now `src/proxy.ts`.
- **`cacheComponents: true`** (in `next.config.ts`). Reading the current time, cookies or other request data during prerender fails the build. All pages are client components that fetch from `/api/*`, so their shells stay static. For "now", use the `useNow()` hook in `src/lib/client.ts`, whose server snapshot is 0; don't call `Date.now()` during render.
- **Tailwind v4**, configured in CSS: design tokens are CSS variables in `src/app/globals.css` (with dark-mode values), exposed as utilities such as `bg-surface`, `text-muted`, `bg-accent-soft`. Tailwind compiles through a Turbopack loader rule, not PostCSS.
- **Neon Postgres + Drizzle**. The `neon-serverless` Pool driver is used because the queue relies on transactions. **R2** is accessed through the S3 SDK with presigned URLs; the browser uploads straight to R2.

## Architecture

**Core flow** (`src/lib/queue.ts` holds all of the business logic):
1. The client turns each photo into the exact print tile in `src/lib/image.ts`: EXIF orientation applied, landscape rotated to portrait, scaled to fit on white, 709×1063 px JPEG. Only this processed file goes to R2.
2. `POST /api/orders` inserts one `slots` row **per printed copy**, then calls `fillSheets()`. That function takes a Postgres advisory lock, assigns queued slots (oldest first) to sheets in groups of 9, and sets `position` 0–8. A remainder becomes a partial sheet only through "In ngay" (`/api/queue/flush`) or the auto-flush timer.
3. Every registered station (`stations` table) polls `POST /api/station/claim` (3 s in production; intervals live in `src/lib/poll.ts` and are much longer under `next dev`). Each poll records that station's heartbeat. Only the **active** station (setting `active_station_id`, chosen in `/admin`) then runs the auto-flush timer (there is no cron) and claims the oldest `ready` sheet with `FOR UPDATE SKIP LOCKED`; the others stand by. Each station PC picks its output in `/admin` on that PC (stored in the browser, `src/lib/station-output.ts`; the station re-reads it every poll): **printer** renders the sheet, waits for its images to load and calls `window.print()`; **pdf** builds the same sheet with pdf-lib (`src/lib/sheet-pdf.ts`, ASCII text only) and writes it into a folder granted through the File System Access API, with no dialog. A station that is not ready to output polls with `{ claim: false }` (heartbeat only). Either way it then acks via `/api/station/sheets/[id]/printed` (or hands it back via `.../release` if images fail).
4. A sheet stuck in `printing` is **never** re-printed automatically, to avoid duplicates. Staff choose `retry` or `mark_printed` (`POST /api/sheets/[id]`). `reprint` copies a printed sheet's slots into a new sheet.

**Print geometry**: `src/lib/sheet-geometry.ts` is the single source of truth, in mm. Photos are exactly 60 × 90 mm with a 4 mm `GAP` between them; thin grey cut lines run edge to edge through the middle of every gap (and 2 mm outside the outer photos), so hand-cutting leaves an even 2 mm white border. `src/lib/sheet-pdf.ts` draws the same layout for PDF output. `src/components/sheet.tsx` renders every length as `n * var(--u)`. With `--u: 1mm` the output is physically exact for printing. In preview mode `--u` is `100cqw/210` (container query units), so the same markup scales for thumbnails. Order codes print rotated in the strip right of the last cut line, one line per row. `/print-test` shows a calibration page.

**Auth**: three roles, tokens `<role>.<id>.<exp>.<hmac>` signed with Web Crypto (`src/lib/auth.ts`).
- **user** (`APP_PASSWORD`, `/login`): upload, see queue and history, cancel only orders created from their own session (`orders.owner_sid`).
- **admin** (`ADMIN_PASSWORD`, `/admin/login`): everything, plus `/admin` (stations, auto-flush, admin devices) and print controls (flush, retry, mark printed, reprint). Each admin device is a row in `admin_sessions`; deleting it revokes that device.
- **station**: a separate `ap_station` cookie set when an admin registers a browser in `/admin`. It can only use `/station` and `/api/station/*`.

`src/proxy.ts` checks signatures only. Every API handler is wrapped in `route(access, handler)` from `src/lib/api.ts`, which checks the role against the database (`src/lib/sessions.ts`), passes the viewer/station to the handler, maps `HttpError` to JSON, and calls `unstable_rethrow` so Next.js internal errors are not swallowed. Validate dynamic `[id]` params with `idParam()`.

**Client data**: `QueueProvider` (`src/components/queue-context.tsx`) polls `/api/queue` (`QUEUE_POLL_MS`). The station chip, the role-aware nav and the queue page all read from it (`queue.viewer.role`). `usePoll` pauses while the tab is hidden. `signGet()` rounds the signing time down to the hour, so image URLs stay stable between polls and the browser cache is reused. Uploads set a `Cache-Control` header that is part of the presigned signature, so the browser must send the exact headers that `/api/uploads/sign` returns.

## R2 bucket setup

CORS must allow `PUT` and `GET` from the app origin, with the headers `Content-Type` and `Cache-Control`. A lifecycle rule that deletes `photos/` objects after about 30 days is recommended. Deleting the objects breaks "In lại" for old sheets.
