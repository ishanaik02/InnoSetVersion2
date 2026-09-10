# Service Engineer Trip Tracking & TA/DA Management App

Full-stack implementation: **React Native (Expo)** mobile app + **Node.js/Express + MongoDB** backend.

## Folder structure

```
service-engineer-app/
├── App.js                     # App entry
├── app.json                   # Expo config (permissions etc.)
├── package.json
├── src/
│   ├── screens/                # Login, Dashboard, NewTrip, RoundTrip, StayTrip, TripSummary, PastTrips
│   │                           # + AdminDashboard, AdminTrips, AdminTripDetail, AdminEngineers
│   ├── navigation/AppNavigator.js   # branches to the engineer stack or the admin stack based on user.role
│   ├── context/                # AuthContext, TripContext (app-wide state)
│   ├── services/                # api.js, authService.js, tripService.js, adminService.js (backend calls)
│   ├── utils/                   # taDaCalculator.js, distanceCalculator.js (core business logic)
│   ├── components/              # AppButton, Card, StatBox
│   └── theme/theme.js           # Blue professional theme, spacing, typography
└── backend/
    ├── server.js
    ├── config/db.js
    ├── models/                  # User.js (role: engineer|admin), Trip.js (receipts stored as Buffers)
    ├── controllers/             # authController.js, tripController.js, adminController.js
    ├── routes/                  # authRoutes.js, tripRoutes.js, adminRoutes.js
    ├── middleware/               # auth.js (JWT), adminOnly.js, upload.js (multer, in-memory)
    └── scripts/createAdmin.js    # CLI script to create/promote an admin user
```

## What's new in this version

**1. Receipts are stored in MongoDB, not on disk.**
Uploaded ticket/hotel/food receipts (images or PDFs, up to 8MB) are saved as
`Buffer` fields directly on the `Trip` document instead of being written to
`backend/uploads/`. At ~100 users this is simpler to run and back up — one
database, no separate file storage/CDN to provision, and receipts move with
the trip record if you ever migrate databases. The heavy bytes are excluded
from normal trip list/detail queries (`select: false`) so dashboards and
trip lists stay fast; they're only pulled in by the dedicated
`GET /api/trips/:id/receipts/:receiptId` route, which streams them back out
with the correct `Content-Type`. If a deployment later needs to support much
larger files or heavier upload volume, swapping this route for S3/GridFS is
a small, contained change — everything else stays the same.

**2. In-app Admin section.**
The `User` model already had a `role: 'engineer' | 'admin'` field — this
build wires it up. Admin accounts are **not** created through the public
sign-up flow (only engineers can self-register); instead you provision them
from the server with:

```bash
cd backend
npm run create-admin -- "Admin Name" admin@company.com ADM001 aStrongPassword123
```

An admin logs in through the exact same Login screen as engineers. Based on
`user.role`, the app then shows a completely separate stack of screens:

- **Admin Dashboard** — engineer count, total/this-month trips, pending
  approvals, approved/rejected counts, distance covered, pending vs.
  approved reimbursement totals.
- **All Trips** — every engineer's trips, filterable by status (Pending /
  Approved / Rejected / All), tap through to detail.
- **Trip Detail** — full trip breakdown, TA/DA and expense totals, uploaded
  receipts (viewable inline), and Approve/Reject actions with an optional
  note back to the engineer.
- **Engineers** — every engineer with a quick activity summary (trip count,
  distance, pending approvals, total reimbursed); tap through to see just
  their trips.

All of this is served by new `/api/admin/*` routes, protected by an
`adminOnly` middleware — engineer accounts get a `403` if they try to call
them directly.

## 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env      # then edit MONGO_URI / JWT_SECRET
npm run dev                # requires nodemon, or `npm start`
```

Make sure MongoDB is running locally, or point `MONGO_URI` at a MongoDB Atlas cluster.

Test it's alive: `GET http://localhost:5000/api/health` → `{ "status": "ok" }`

### Create a test user

`POST /api/auth/register` is **admin-only** (see "Create the admin account"
below) — there's no public self-signup. To create your first test engineer,
either use the in-app **Admin → Engineers → + Add Engineer** screen once
you're logged in as an admin, or run it from the CLI:

```bash
cd backend
node -e "
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');
(async () => {
  await connectDB();
  const passwordHash = await bcrypt.hash('test1234', 10);
  await User.create({ name: 'Ravi Kumar', employeeId: 'EMP1001', email: 'ravi@company.com', passwordHash });
  console.log('Created EMP1001 / test1234');
  process.exit(0);
})();
"
```

Then log in with `employeeId: EMP1001`, `password: test1234`. For bulk
onboarding, use `node scripts/bulkCreateEngineers.js path/to/engineers.csv`
instead.

If an engineer forgets their password, there's no self-service reset —
an admin resets it from **Admin → Engineers → Reset Password** on that
engineer's card (backed by `PATCH /api/admin/engineers/:id/reset-password`),
and shares the new password with them directly.

### Create the admin account

There's no public "sign up as admin" endpoint on purpose. Create (or promote)
an admin user directly on the server:

```bash
npm run create-admin -- "Admin Name" admin@company.com ADM001 aStrongPassword123
```

Log in with `employeeId: ADM001` and that password — the app will show the
Admin Dashboard instead of the engineer flow automatically, based on the
account's `role`.

## 2. Run the mobile app

```bash
npm install
```

`src/services/api.js` defaults `BASE_URL` to the deployed Railway backend.
To point at a local backend instead (your phone is a separate device on the
network, so use your machine's LAN IP, not `localhost`), set
`EXPO_PUBLIC_API_URL` before starting Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:5000/api npx expo start
```

EAS builds pick this up automatically per profile from `eas.json` (`development`
points at a placeholder LAN IP you should edit, `preview`/`production` point
at the deployed backend) — see the `env` block under each build profile.

Scan the QR code with **Expo Go** (iOS/Android) or run on a simulator.

> Note: the in-app map (`src/components/OpenStreetMap.js`) is a Leaflet map
> rendered inside a WebView, loading tiles from `tile.openstreetmap.org` and
> Leaflet's JS/CSS from `unpkg.com`. This works in plain Expo Go (no native
> maps module or Google Maps API key needed) but does depend on those two
> third-party services being reachable at runtime. OpenStreetMap's tile
> servers are meant for light/evaluation use — before a wider production
> rollout, switch to a paid tile provider (e.g. MapTiler, Mapbox, Stadia
> Maps) or self-hosted tiles to avoid rate-limiting at scale.

## 3. How the core logic works

**TA/DA calculation** (`src/utils/taDaCalculator.js`, mirrored server-side in `backend/utils/taDaCalculator.js` as the source of truth — the server always recomputes and never trusts a client-submitted amount):
- Bike → distance × ₹3.5/km, all grades
- Car → distance × ₹6/km, **only grades IE2/IE1** (policy sheet §8); the UI disables the Car option and the backend zeroes the amount for ineligible grades
- Bus / Train → manual entry from uploaded ticket, no formula
- Plus a DA (daily allowance) slab on top: ₹150 (≤100km), ₹250 (>100km), or ₹300 (overnight stay) — waived for local (in-branch) visits — see `backend/utils/policyRates.js`

**Distance calculation** (`src/utils/distanceCalculator.js`): Haversine formula summed across GPS points collected via `expo-location`'s `watchPositionAsync` during Start Trip → Reach Site → Complete & Return.

**Trip flow state machine** (`src/context/TripContext.js`):
`draft → in_progress → at_site → returning → completed → submitted`

## What changed in this review pass

**1. Stay-trip receipts (hotel/food/other) now actually reach MongoDB.**
Previously, `StayTripScreen` only kept the picked photo's local `uri` in
React state — it was never uploaded, so hotel/food bills never made it into
the database (only the bus/train ticket, from `TripSummaryScreen`, did).
Now, each stay expense photo is uploaded to `POST /trips/:id/receipts`
**immediately** when the engineer taps "Add Expense," with the amount/notes
attached — so it's safely in the database as soon as it's captured, not just
at final submit. If the upload fails (e.g. spotty signal at a site), the
expense is flagged "⚠ will retry on submit," and `TripSummaryScreen` makes
one more attempt for any flagged item before the trip is submitted, so a
receipt is never silently dropped.

**2. Fixed a mislabeled-file bug for ticket receipts.**
The bus/train ticket upload hardcoded `type: 'image/jpeg'` regardless of the
actual file — so a PDF ticket would be stored and served back with the
wrong content type (breaking the PDF preview/download on the admin side).
It now reads the real `mimeType`/`name` from the picker result.

**3. Admin can now see receipts without opening every trip.**
- **All Trips / Pending Requests list** — each trip card now shows small
  thumbnails (or a "PDF" chip for non-image receipts) plus a document count,
  so an admin can spot-check that something was uploaded before even opening
  the trip.
- **Engineers list** — each engineer's card now shows total receipts
  uploaded and, if any of their trips are still `submitted`, how many
  receipts are awaiting review.
- The full-resolution, tap-to-open receipt viewer on the **Trip Detail /
  Review** screen was already in place and is unchanged.

## v3.1 — Play Store readiness pass

A full audit of every file (backend routes/controllers/models, every
frontend screen/service/component, `app.json`, `eas.json`) turned up the
following, all fixed in this pass:

1. **`app.json` blocked the exact permissions the app needs.**
   `blockedPermissions` stripped `CAMERA` and `READ_MEDIA_IMAGES` from the
   Android manifest, and `expo-image-picker`'s plugin config had
   `photosPermission: false` / `cameraPermission: false` — so the receipt/
   bill photo picker was fighting the app's own manifest. Fixed: `CAMERA`
   and `READ_MEDIA_IMAGES` are now allowed, and both platforms have real
   usage-description strings.
2. **The "📷 Upload Bill (Camera/Gallery)" button never opened the
   camera** — `StayTripScreen`'s `pickImage` only ever called
   `launchImageLibraryAsync` (gallery). It now prompts to Take Photo or
   Choose from Gallery, matching the label.
3. **`POST_NOTIFICATIONS` was declared but unused** — no push-notification
   code exists anywhere in the app. Removed the permission rather than ship
   an unjustified one; push notifications for approval/rejection are still
   a good follow-up (see below) but should be added together with the
   permission, not before it.
4. **CORS failed open.** If `CORS_ALLOWED_ORIGINS` was unset in production,
   the server allowed *any* browser origin — the opposite of an allowlist.
   It now fails closed in production (native app requests, which send no
   `Origin` header, are unaffected) and only falls back to "allow all" in
   local development.
5. **No way to reset a forgotten engineer password.** The old "Add Engineer"
   success message said you could "reset it by re-adding them later," but
   `employeeId` is unique, so re-adding always 409s. Added a real
   `PATCH /api/admin/engineers/:id/reset-password` endpoint and a "Reset
   Password" action on each engineer's card in **Admin → Engineers**.
6. **Hardcoded production API URL** with no way to point a build at a
   different backend. `BASE_URL` now reads `EXPO_PUBLIC_API_URL` first (see
   `eas.json`'s per-profile `env` blocks), falling back to the deployed
   Railway URL.
7. **This README was stale**, describing Expo SDK 51 (the code has been on
   SDK 57 since the receipts/admin-section update), the pre-policy-sheet
   TA/DA rates, and a `/auth/register` curl example that 401s against the
   actual (admin-gated) route. Corrected throughout.

### Still open (flagging for a planned, tested pass — not applied here)

- **App icon is 512×512.** Both stores prefer 1024×1024 source art —
  `assets/icon.png` should be replaced with a proper high-resolution icon
  before submission; this wasn't something to safely auto-generate.
- **OpenStreetMap tiles** are pulled live from `tile.openstreetmap.org` and
  `unpkg.com` — fine for development/pilot, but move to a paid tile
  provider before a full ~100-user rollout (see the map note above).
- Push notifications (Expo Notifications) so an engineer is told the moment
  a submitted trip is approved/rejected, instead of checking the dashboard.
- Add server-side request validation (`zod`/`joi`) on the trip/admin routes.
- Add pagination to `/api/admin/trips` (currently capped at 500, fine for
  now, but worth revisiting as trip volume grows).
- An admin-facing way to deactivate/offboard an engineer account (today
  only individual trips can be deleted, not the account itself).
- Automated tests (none exist yet) — at minimum around `taDaCalculator.js`
  and `distanceCalculator.js`, since those drive real reimbursement amounts.

## What's stubbed vs. production-ready

Production-ready: navigation, screens, TA/DA math, distance math, trip state machine, REST API, JWT auth, MongoDB schemas, receipt upload/storage (in MongoDB), in-app admin section (dashboard, trip review/approval, engineer activity).

You'll likely want to add before shipping:
- Push notifications (Expo Notifications) for approval status updates
- Background location tracking permissions flow (iOS requires extra App Store justification)
- Refresh tokens / token expiry handling
- Input validation library (e.g. `zod`/`joi`) on the backend routes
- Automated tests
- If usage grows well past ~100 users or receipts get large/frequent, move receipt storage from MongoDB Buffers to S3/GridFS (the `getReceiptFile` route is the only place that would need to change)
