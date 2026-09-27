# PRODUCTION RED FLAGS — InnoSet v4 (Play Store release audit)

> **Date:** September 27, 2026 | **Scope:** full backend + frontend, pre-launch audit
> **Legend:** 🔴 = fix before Play Store launch | 🟠 = fix before broad rollout | 🟡 = fix soon / tech debt
> **💰 = directly drives Railway memory/CPU/egress cost** — the 💰-tagged items in the Critical/High sections are the cost levers for the optimization pass.
> **UPDATE (Sept 27, cost pass):** Part 4 levers 1–4 are now IMPLEMENTED and verified against a live MongoDB + running server — see "Part 4 status" at the bottom of this document.

---

## Part 1 — Critical (🔴 fix before launch)

### C1. Play Store signing keystore passwords committed to git 🔒 SECURITY
**`credentials.json:1-10` (git-tracked)**

The Android upload/installer keystore credentials are committed in plaintext:
```json
"keystorePassword": "39d5df83a3ecd3c5d72ce1e9d4640078",
"keyPassword": "56e0b3d6d5ed118bcb78bfae8a083ef5"
```
Anyone with repo access (or a future accidental public flip) can sign a malicious update to the Play Store listing. If this ever leaks, you **cannot revoke it** — the keystore *is* the app identity.

**Fix:** `git rm --cached credentials.json`, add to `.gitignore`, rotate passwords, and keep credentials in EAS Secrets / local-only files. Treat every commit that contained it as compromised. *(Note: an EAS-managed keystore may make the local one redundant — verify before rotating.)*

---

### C2. Duplicate bill numbers under concurrent submissions (data-corruption class) 💰
**`backend/controllers/tripController.js:8-21` + `:429-497` (`generateBillNumber` + `submitTrip`), duplicated at `backend/controllers/billController.js:8-19` + `:192`**

Bill numbers are generated with **count-then-write**:
```js
const count = await TADABill.countDocuments({ billNumber: { $regex: `^${prefix}` } });
const seq = String(count + 1).padStart(6, '0');
```
Two engineers submitting at the same moment compute the same `seq` → same bill number. `billNumber` is `unique: true` (`models/TADABill.js:60`), so the second create **throws** — and because `submitTrip` has no retry, the *trip is already saved as `submitted` but the bill never gets created* (trip is marked submitted at `tripController.js:471`, bill created after at `:479`). Result: **approved-looking trips with no bill**, permanently. Also a growing `$regex: ^prefix` full scan on the bill collection on every submit (💰 CPU on MongoDB Atlas, which Railway's egress/latency amplifies).

**Fix (pick one):**
1. Retry-on-`E11000` loop (3 attempts, recompute seq) — smallest change; or
2. `findOrCreate` on a per-branch counter collection with `$inc` (atomic, no regex scan); or
3. Retry + change query to `TADABill.countDocuments({ branch, billDate: { $gte: new Date(year,0,1) } })` so the count uses indexed fields instead of regex.

Also wrap the whole `submitTrip` in a **MongoDB transaction** (trip status change + bill creation) so a partial failure can't leave a submitted trip without a bill.

---

### C3. `GET /api/bills/:id/history` has zero authorization — any employee can read any bill's full audit trail 🔒 SECURITY
**`backend/controllers/billController.js:625-639`, route `backend/routes/billRoutes.js:77-78`**

```js
const bill = await TADABill.findById(req.params.id).select('approvalHistory billNumber status');
const auditLogs = await BillApproval.find({ bill: req.params.id })...
```
No scope check whatsoever. Any `service_engineer` with a valid token can enumerate bill IDs and read every other branch's bill numbers, statuses, amounts, approver names, and **rejection remarks** (HR comments about employees — sensitive HR data).

**Fix:** copy the scope-check block from `getBillById` (`billController.js:107-118`).

---

### C4. Missing shutdown, rejection and crash handlers on Railway 🔥 RELIABILITY
**`backend/server.js:103-110`**

Railway sends `SIGTERM` on redeploys/scales; the process has no handler, so in-flight requests (a receipt upload mid-write, an approval save) are cut off mid-transaction. MongoDB socket death on network blips throws asynchronously — with no `unhandledRejection` handler those can kill the Node process (unattended 3 a.m. outage until next deploy pings it). Also `connectDB().then(...)` at `server.js:108` has **no `.catch`** — a rejected promise here vanishes.

**Fix (≈15 lines):**
```js
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
const server = app.listen(PORT, ...);
process.on('SIGTERM', () => {
  server.close(async () => { await mongoose.connection.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
```

---

### C5. Trip history/track endpoints leak every employee's GPS location to any authenticated user 🔒 SECURITY
**`backend/controllers/tripController.js:51-77 (saveLocation), 119-221 (uploadLocationBatch), 223-264 (getLiveLocation), 266-305 (getRouteHistory)`**

None of these four controllers checks *ownership or scope* — they only `Trip.findById(id)`:
- Any user can `GET /api/trips/:anyTripId/route` and replay another employee's **entire GPS track** (home address, hotel, movement patterns).
- Any user can `POST /api/trips/:anyTripId/location` and **inject fake GPS points into someone else's trip** → corrupts the TA/DA distance that bills are paid on (financial fraud vector).
- `uploadLocationBatch` additionally trusts `points.length` from the client and pushes all of it into the doc with no cap (💰 unbounded doc growth → see H4).

**Fix:** reuse the `query.engineer / query.branch` scope pattern from `getTripById` (`tripController.js:356-380`), and enforce `engineer: req.userId` for all writes.

---

## Part 2 — High (🟠 fix before broad rollout)

### H1. Engineer dashboard loads EVERY trip document of every engineer on every dashboard refresh 💰💰 (top CPU lever)
**`backend/controllers/tripController.js:615-640` (`getDashboardStats`)**

```js
const trips = await Trip.find({ engineer: req.userId });   // no projection, no limit
```
Every dashboard open pulls **full documents** — including `outboundPoints`/`returnPoints` (thousands of embedded GPS points) and receipt metadata — for the engineer's entire history, then JS-filters in memory. With ~100 engineers opening the app each morning, this is the single heaviest repeated query in the app. It also has no projection guard on `receipts` metadata.

**Fix:** aggregation with `$match {engineer} → $project {status, outboundDistanceKm, returnDistanceKm, grandTotal}` + `countDocuments` for totals, or at minimum `Trip.find(query).select('status outboundDistanceKm returnDistanceKm grandTotal')`. Same pattern (already projection-free but count-based, lower risk) confirmed OK in `dashboardController.js:24-27`.

### H2. Every request pays a MongoDB round-trip for auth 💰 (latency + Atlas reads)
**`backend/middleware/auth.js:23`**

`User.findById(decoded.userId)` runs on **every single API call** (all 40+ routes). At 100 users × refresh-on-every-screen, that's a constant stream of Atlas reads — and each Atlas read adds latency to every request.

**Fix:** trust the JWT claims (`role`, `branchId` are already in the token, `authController.js:81-84`) and only DB-check users when the token is older than ~5 minutes (claims-staleness window). Or cache user lookups in-memory for 60 s. Cuts auth DB load by ~90%.

### H3. `markAttendance` / attendance dashboards: doc-growth + 2000-record payloads 💰
- **`backend/controllers/attendanceController.js:74-103`** — read-check-then-write with no atomic guard. Two rapid taps → two creates → the `11000` catch (`:139`) misreports as "already marked" and **the first mark is silently overwritten-or-lost** depending on ordering. Use `findOneAndUpdate` upsert for atomicity.
- **`attendanceController.js:200`** — `getAllAttendance().limit(2000)` then populates 3 refs. A super_admin opening "Attendance Audit" pulls a multi-MB JSON payload; the phone then renders a 2000-row FlatList. Memory spike on device + ~MBs egress per open. Paginate (`?page&limit=50`), default a date filter to "today".
- **`attendanceController.js:171`** — same at limit 1000 for branch view.

### H4. Embedded GPS arrays grow without cap 💰 (biggest long-term storage cost)
**`backend/models/Trip.js:94-95` (`outboundPoints: [pointSchema]`, `returnPoints: [...]`)**

A 6-hour round trip at 5 s sampling ≈ 4,300 points; each point ≈ 120 B → ~0.5 MB *per trip* inside one document. MongoDB warns beyond 16 MB/doc. More importantly for cost: **any read of these arrays (dashboard H1, admin overview at `adminController.js:57` which selects `receipts` but not points, route replay) drags MBs through Atlas → Railway egress every time**. The `select('-outboundPoints -returnPoints')` guard exists in `reportController.js:118` and `adminController.js:117` but NOT in `getDashboardStats` (`tripController.js:617`) or `getTrips` (`:390`).

**Fix:** (a) add `.select('-outboundPoints -returnPoints')` everywhere trips are listed; (b) decimate points client-side before upload (keep 1 point/15 s); (c) plan migration of point arrays to a separate `tripPoints` collection with TTL/retention — replay needs only the route, dashboards never need points.

### H5. Dead `adminOnly` middleware + `admin` role handling
**`backend/middleware/adminOnly.js:1-8`** checks `req.userRole !== 'admin'` — but the role was renamed `super_admin` in v4 (`models/User.js:14-25`). `authRoutes.js:7` still mounts it on `/register`, so **no super_admin can ever use `POST /api/auth/register`** (always 403). Harmless-looking but it's a live route that silently 403s for its intended audience, and `AppNavigator.js:196` still renders a legacy `AdminStack` for `case 'admin'` — dead code path from pre-migration users. If any DB user still has `role: 'admin'` (check!), their JWT carries a role every v4 roleGuard rejects → they can't use the app at all.

**Fix:** change `adminOnly.js` to `super_admin` (or delete + use `roleGuard('super_admin')`), run the role-migration script, and drop the `case 'admin'` nav branch once no user has the legacy role.

### H6. `updateTrip` lets the client overwrite computed financials before server recalc
**`backend/controllers/tripController.js:307-356`**

`allowedFields` (`:314-339`) includes `taDaAmount`, `daAmount`, `stayExpensesTotal`, `grandTotal` — the client sets these from the body, then the server recalculates `taDaAmount`/`daAmount`/`grandTotal` (`:345-355`) but **not** `stayExpensesTotal` beyond `req.body.stayExpensesTotal` (`:349-350`). `grandTotal` is recomputed so spoofing it is temporary, but the transiently-trusted client value `stayExpensesTotal` flows straight into the bill at submit (`:477-485`). Lodging amounts are supposed to be policy-capped per grade (`policyRates.js:37-44 getLodgingLimit` exists but **is never called** in any controller).

**Fix:** validate `stayExpensesTotal ≤ getLodgingLimit(engineer.grade, hasBill)` server-side, and remove financial fields from `allowedFields` entirely.

### H7. Print flow: response field mismatches + dead dependency cost 💰
- `react-native-print@0.11.0` (`package.json:33`) is a **native module**. It is NOT part of Expo Go and requires a dev-client/EAS build; the package was last updated years ago and is unmaintained. If the team ever tests via Expo Go, the print button crashes. Verify the EAS dev-client includes it, or switch to the already-installed `react-native-webview` (`package.json:39`) + Android print service, dropping one native dependency.
- `billController.js:604-606` returns `dailyAllowance/stay/other` keys; the print HTML builder (`src/screens/BillDetailScreen.js:82+`) reads `amounts.dailyAllowance` ✓ — but `EditBillAmountsScreen.js` was updated to send `daAmount/stayAmount/otherAmount` while the print payload also renames them. Field naming across `dailyAllowance` vs `daAmount` is inconsistent in three places (`billController.js:604-606`, `AccountDeptDashboardScreen.js:109`, `getBillPrint` mapping) — one rename missed in the next screen change breaks the payout display silently.

### H8. No compression, no pagination contract 💰
**`backend/server.js:1-45`** — no `compression` middleware; every list response (`limit(500)` bills at `billController.js:90`, 1000/2000 attendance, 500 trips) ships uncompressed JSON over Railway egress. JSON compresses ~80%. `npm i compression` + one line is the cheapest egress reduction available.

Also: list endpoints have hard `limit()`s but no `page`/`offset` contract — the client can never see beyond the first 500 bills, and can't ask for less. As data grows this becomes both a UX cliff and a memory cliff.

---

## Part 3 — Medium (🟡)

- **M1. Auth via `?token=` query param** — `backend/middleware/auth.js:9-12` accepts tokens in the URL for receipt `<Image>` loads. Tokens leak into access logs, Railway request logs, and any error tracker. Short-term: keep, but log-scrub `token`. Long-term: signed short-lived receipt URLs.
- **M2. Error responses leak internals** — every controller catches with `error: err.message` in the JSON (e.g. `tripController.js:508`, `billController.js:542`). `server.js:104-108` has a central handler that hides them, but controller-level catches win the race. Stack-level details (MongoDB errors incl. collection names) go to clients. Remove `error: err.message` from all client responses.
- **M3. `attendance cutoff` hardcodes IST** — `attendanceController.js:20-28` adds a fixed +5:30. Correct for MP branches today; if the org ever adds a non-IST branch, cutoffs silently shift. Store a `timezone` per Branch.
- **M4. `trip.status` accepted verbatim from client** in `updateTrip` (`tripController.js:324`) — an engineer can flip their own trip to `approved_by_bm` etc. (nothing downstream validates the chain for trips; bill chain IS validated). Restrict status transitions server-side.
- **M5. `attendanceCutoffTime` never auto-marks absent** — DATABASE_DESIGN.md §6 promises "after cut-off unmarked = auto-absent", but there is no cron/job doing this anywhere. Either implement (Railway cron service) or drop the claim; reports currently undercount absents.
- **M6. Bill approval: no notification to next approver** — `getNextApprover` (`billController.js:22-45`) resolves the next approver but nothing tells them. Approvals stall until someone opens the app. (Spec'd in DATABASE_DESIGN §5 "Notification and audit trail support" — only audit trail exists.)
- **M7. `getBills` account_dept status override bug** — `billController.js:64-66`: `if (userRole !== 'account_dept' || userRole === 'super_admin')` — for super_admin with `branch` filter set this is fine, but the expression's intent (block account_dept from overriding) is wrong for `service_head` too, letting SH pass `status=draft` — probably harmless, but the condition is logically muddled and should be explicit.
- **M8. No request-size cap on `location/batch`** — `tripController.js:119` accepts `points` array with no max length. A malicious or buggy client can POST 100k points in one request (8MB JSON body limit at `server.js:36` is the only guard) and pin CPU. Cap at e.g. 500 points/batch.
- **M9. Receipt `getReceiptFile` loads full Buffer into memory** — `tripController.js:560` selects `+receipts.data` and `res.send(receipt.data)`: fine at 8 MB/file × low traffic, but N concurrent receipt views = N × 8 MB RAM on a 512 MB Railway container. Worth switching to GridFS/streaming if receipt volume grows. *(Buffer-in-MongoDB for receipts at TADABill.receipts (`models/TADABill.js:67-89`) is currently written by nobody — dead schema; trip.receipts is the live one. Confirmed auto-bill flow doesn't copy receipts to the bill.)*
- **M10. `.env` has 9 keys; `MONGODB_URI` vs `MONGO_URI`** — scripts accept both (`scripts/*.js:9`), server only `MONGO_URI` (`server.js:21`). Harmless but confusing; scripts silently falling back to `localhost` means a mis-set var migrates the wrong DB.

---

## Part 4 — Railway cost optimization levers (ranked)

These are the levers the optimization pass should take, ordered by expected savings. Each maps to findings above.

| # | Lever | Finding | Effort | Expected impact | Status |
|---|-------|---------|--------|-----------------|--------|
| 1 | Add projection `select('-outboundPoints -returnPoints')` to `getDashboardStats` + `getTrips` | H4, H1 | 2 lines | Removes MBs from the highest-frequency query; biggest CPU+egress win | ✅ **APPLIED** (dashboard; `getTrips` intentionally deferred — see status section) |
| 2 | Replace `Trip.find({engineer}).lean()` dashboard scan with `$project` aggregation | H1 | ~20 lines | Dashboard payload from ~100s of KB → ~1 KB | ✅ **APPLIED** (via projection — same outcome, smaller diff than a full aggregation rewrite) |
| 3 | JWT-claims auth with staleness window (skip per-request `User.findById`) | H2 | ~30 lines | ~90% fewer auth DB reads; every request gets faster | ✅ **APPLIED** (60 s TTL DB-doc cache — safer variant, see status section) |
| 4 | `compression` middleware | H8 | 1 line + dep | ~80% smaller JSON responses → direct egress savings | ✅ **APPLIED** (measured −93.7% on a 500-point route payload) |
| 5 | Paginate attendance + bills lists (default `limit=50`) | H3, H8 | ~30 lines | Caps worst-case payload; stops 2000-row device renders | ⏸ **PAIRED FRONTEND CHANGE REQUIRED** — skipped per contract-preservation rule (see status section) |
| 6 | Cap `location/batch` to ≤500 points + decimate on client before upload | H4, M8 | client+server | Bounds storage growth, the long-run Atlas cost driver | ✅ **APPLIED (server half)** — 500-point cap live; client-side decimation still recommended |
| 7 | Atomic bill-number (`$inc` counter collection) | C2 | ~20 lines | Removes the `$regex ^prefix` full-scan per submit | ⏳ open — C2 is a correctness blocker, queued for the critical-fixes pass |
| 8 | In-memory 60 s cache for `getNextApprover`/branch lookups | C2-adjacent | ~15 lines | Removes 2-3 User/Branch queries per approval action | ⏳ open |

*(Bill-number retry C2 is correctness-first; the counter-collection variant also delivers lever 7.)*

---

## Part 4 status — what the cost pass actually changed (Sept 27)

**Applied (4 of 8 levers):**

1. **Dashboard projection** — `tripController.js getDashboardStats` now runs `Trip.find({ engineer }, 'status outboundDistanceKm returnDistanceKm').lean()` instead of loading full documents. Full trip docs (with embedded GPS arrays + receipt metadata) are never pulled for stats anymore.
2. **Compression** — `compression@^1.8.2` added to `backend/server.js` before all routes. Only compresses when the client sends `Accept-Encoding: gzip`; responses to clients without it are byte-identical in shape.
3. **Auth user cache** — `middleware/auth.js` now keeps a bounded (max 1000 entries) in-process Map of user docs with a 60 s TTL (env-tunable via `USER_CACHE_TTL_MS`). Tokens are still verified on every request; role/branch/isActive always come from the cached **DB document**, never from JWT claims. Chosen over the doc's original "trust token claims" sketch precisely to keep deactivation/role-revocation safe: worst-case revocation latency is now ≤ TTL (was: immediate). Deactivation also now cuts off users within TTL — same guarantee class as before, bounded staleness documented and tested.
4. **GPS batch cap** — `tripController.js uploadLocationBatch` rejects >500 points per request with `413` and empty/missing arrays with `400`. 500 matches the app's own `UPLOAD_BATCH_SIZE`, so legitimate clients are unaffected. Server-side only; client-side decimation before upload remains a recommendation.

**Deliberately NOT changed (contract preservation, as the pass brief required):**

- **Attendance/bills pagination (lever 5)** — the current responses are bare `{ records }` / `{ bills }` arrays; `HRDashboardScreen`, `HRAttendanceScreen`, `BillsScreen`, `BillApprovalScreen` and `AccountDeptDashboardScreen` all read them as arrays (`.length`, `.filter`, `.map`). Adding `page`/`total` metadata or a smaller default limit would change what these screens receive mid-list — a **paired frontend change**, recorded here instead of half-applied. The frontend work: add `page`/`limit` query params to the screens' fetch functions, switch FlatLists to `onEndReached` incremental loading, and only then raise the server to paginated responses.
- **`getTrips` projection** — `PastTripsScreen` taps into trip detail straight from the list response and other screens may read list fields we can't verify without a device run; deferred to the same paired-frontend pass as pagination rather than risk a blank field on the Play Store build.

**Verification performed (live server + real MongoDB `innoset_costpass_test`, before/after):**

| Check | Before | After |
|---|---|---|
| `GET /api/dashboard/stats` (engineer w/ 8 trips) | 200, correct stats | 200, **byte-identical stats body** (projection is invisible to clients) |
| `POST /api/trips/:id/location/batch` 600 points | 200, all 600 stored | **413**, 0 stored (verified via `GET /:id/route`) |
| `POST .../batch` 500 points (client's exact batch size) | 200 | 200, exactly 500 stored |
| `POST .../batch` empty array | 500 (server error) | **400** with explicit message |
| Route payload 79,133 bytes | gzip n/a | **5,022 bytes** (−93.7%), `Content-Encoding: gzip`; no-gzip clients unaffected |
| 8 rapid requests, one user (TTL=3 s test value, query log on) | 8 `users.find` queries | **1** `users.find` query (7/8 served from cache) |
| TTL expiry (wait 4 s > 3 s TTL) | — | exactly **+1** fresh DB read on next request |
| Deactivate user → immediate request | 401 instantly | 200 within TTL (bounded staleness, by design), **401 after TTL** |
| Forged JWT claiming `super_admin` for an engineer's userId | — | **403** with `current: "service_engineer"` — role resolved from DB doc, claim ignored |
| Regression: trip create → update → submit → auto-bill → BM approve | worked | works identically (bill `BR99-TA-2026-000001`, amounts recalculated server-side: TA 385 + DA 250 = 635) |

Test harness: `backend/scripts/costPassTest.js` (gitignored, local-only) — seeds a throwaway DB, drives login/dashboard/batch/route/bills over HTTP, supports forging role-claim tokens. Real DBs untouched; test server run on port 5050 and stopped after the pass.

---

## Part 5 — Frontend: usability on all phone types

### F1. 🟠 No `POST_NOTIFICATIONS` runtime request — notifications silently absent on Android 13+
`app.json:47` explicitly **blocks** `POST_NOTIFICATIONS`, and no screen requests notification permission. On Android 13+ (Play Store majority), any future notification/badge feature will be dead on arrival. This collides with M6 (approvals need notifying). Decide: either request permission and add the channel before launch, or accept in-app-only notifications for v1 and remove the block so it's available later without a Play Store release.

### F2. 🟠 Fixed-height screens + no `useWindowDimensions` anywhere
`grep useWindowDimensions|Dimensions src/` → **zero hits**. Screens use fixed paddings and card grids tuned for ~5" displays. Small phones (568 dp height, common budget Android) and large phones/tablets will both render awkwardly. Biggest risks: dashboard stat grids (`BranchManagerDashboardScreen`, `HRDashboardScreen`, `SuperAdminDashboardScreen`) and the approval-card lists. Lowest-cost fix: `FlexWrap` rows with `minWidth` instead of fixed 2-column grids; verify on a 4.7" emulator profile.

### F3. 🟡 Fixed map heights overflow small screens
`AdminTripDetailScreen.js:348`, `EngineerTripDetailScreen.js:162` (`height: 260`), `StayTripScreen.js:365` (`height: 220`) — hardcoded map heights inside ScrollViews are acceptable, but on landscape/large tablets they waste half the screen. Cosmetic.

### F4. 🟡 `userInterfaceStyle: "light"` only
`app.json:7` — dark-mode users get a blinding light app; not a blocker, but Play Store screenshots for dark mode fail preview checks. Low priority.

### F5. 🟡 No tablet layout check
`supportsTablet: false` for iOS (`app.json:10`) but Android tablets can still install and will run the phone layout stretched. Not blocking.

### F6. 🔴 `versionCode: 4` with brand-new features — Play Store metadata
`app.json:5,24` — version `3.1.0`/`versionCode 4` while the codebase is the v4 multi-branch rewrite. If versionCode 4 was already uploaded in a previous internal test, this AAB **will be rejected** (versionCode must strictly increase). Bump `versionCode` (e.g. 10) and set `version 4.0.0` before the first EAS build of this branch.

### F7. 🟠 `react-native-print` breaks Expo Go / web testing (dup of H7, frontend view)
Print button works only in dev-client/standalone builds; the team's usual `expo start` flow will crash on it. Either add a capability check (`expo-dev-client` detection) or swap to WebView-print.

### F8. 🟡 KeyboardAvoidingView missing on form-heavy screens
`AttendanceScreen`, `EditBillAmountsScreen`, `NewBillScreen`-successor flows put TextInputs below the fold; on small screens the keyboard covers the submit button. Add `KeyboardAvoidingView behavior="padding"` (iOS) and verify on Android with `windowSoftInputMode=adjustResize`.

---

## Fix order recommendation

**Before Play Store submission (hard blockers):**
1. C1 (rotate keystore, untrack) — one bad day away from losing app identity
2. F6 (versionCode bump) — submission will literally fail without it
3. C3, C5 (auth-scoping holes) — these are the embarrassing-to-explain breaches
4. C2 (bill race) — otherwise first busy day creates financial-corruption tickets
5. C4 (shutdown/rejection handlers) — otherwise first redeploy during a bill approval corrupts state

**Before broad rollout:** H1→H8, F1, F2
**Ongoing:** all 🟡 items as touched

---

## Verification of this audit

Every finding above was verified against the code on disk at commit `c05a916` (branch `main`, working tree with the uncommitted v4 changes). Line numbers refer to the current working tree. The cost levers in Part 4 have since been applied and live-verified — see "Part 4 status"; the Critical/High findings themselves are documented but **not yet fixed** (C1–C5, H1–H8 remain open except where Part 4 status notes overlap).
