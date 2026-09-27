/**
 * Cost-pass test harness (gitignored — local test tooling, never runs in prod).
 *
 * Usage: node backend/scripts/costPassTest.js <phase> [args...]
 *
 *  seed                              — create test users + trips in innoset_costpass_test
 *  login <employeeId> <password>     — POST /api/auth/login, print token
 *  dash <token>                      — GET /api/dashboard/stats  (lever 1 surface)
 *  route <token> <tripId> [N]        — POST N GPS points to /api/trips/:id/location/batch (lever 4 surface)
 *  routeget <token> <tripId>         — GET /api/trips/:id/route
 *  create <token> <tripId>           — POST /api/trips/:id/location (single point)
 *  deact <token-of-admin> <userId>   — PATCH /api/users/:id { isActive:false } (lever 3 revocation test)
 *  me <token>                        — GET /api/bills (generic authed GET; 401 means token rejected)
 *
 * Env: API (default http://127.0.0.1:5050/api). MongoDB: MONGO_URI or
 * mongodb://127.0.0.1:27017/innoset_costpass_test — throwaway DB, real data untouched.
 */
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/innoset_costpass_test';

const API = process.env.API || 'http://127.0.0.1:5050/api';

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}

function point(i, phase) {
  // Deterministic points along a line near Indore, jittered by i
  return {
    latitude: 22.7196 + i * 0.0001,
    longitude: 75.8577 + i * 0.0001,
    accuracy: 8 + (i % 5),
    altitude: 550,
    speed: 5.5,
    heading: 90,
    timestamp: new Date(Date.now() - (10000 - i) * 1000).toISOString(),
    tripPhase: phase || 'outbound',
  };
}

async function seed() {
  const { connect } = require('../node_modules/mongoose');
  const mongoose = require('../node_modules/mongoose');
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'innoset_costpass_test' });

  const Branch = require('../models/Branch');
  const User = require('../models/User');
  const Trip = require('../models/Trip');

  await Promise.all([
    Branch.deleteMany({}), User.deleteMany({}), Trip.deleteMany({}),
  ]);

  const branch = await Branch.create({ name: 'Test Branch', code: 'BR99', city: 'Indore' });

  const users = {};
  for (const [key, def] of Object.entries({
    eng1:  { name: 'Eng One',  employeeId: 'TESTENG1', role: 'service_engineer' },
    eng2:  { name: 'Eng Two',  employeeId: 'TESTENG2', role: 'service_engineer' },
    bm:    { name: 'Branch Mgr', employeeId: 'TESTBM1', role: 'branch_manager' },
    admin: { name: 'Super Admin', employeeId: 'TESTADM1', role: 'super_admin' },
  })) {
    users[key] = await User.create({
      ...def,
      passwordHash: await require('bcryptjs').hash('testpass123', 10),
      grade: 'IE7',
      branch: branch._id,
      isActive: true,
    });
  }

  // 8 trips for eng1 with modest distances (dashboard sums these)
  const trips = [];
  for (let i = 0; i < 8; i++) {
    trips.push(await Trip.create({
      engineer: users.eng1._id,
      branch: branch._id,
      startLocation: 'A', destination: 'B',
      date: new Date(), tripType: 'round', conveyance: 'bike',
      outboundDistanceKm: 10, returnDistanceKm: 5,
      status: 'completed',
    }));
  }
  // 1 trip for eng2 (must NEVER appear in eng1's dashboard)
  await Trip.create({
    engineer: users.eng2._id, branch: branch._id,
    startLocation: 'X', destination: 'Y',
    date: new Date(), tripType: 'round', conveyance: 'bike',
    outboundDistanceKm: 999, returnDistanceKm: 999, status: 'completed',
  });

  console.log(JSON.stringify({
    ok: true,
    branchId: branch._id,
    users: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, String(u._id)])),
    eng1Trips: trips.map((t) => String(t._id)),
  }, null, 2));

  await mongoose.disconnect();
}

async function main() {
  const [phase, ...args] = process.argv.slice(2);

  switch (phase) {
    case 'seed': return seed();

    case 'login': {
      const { status, data } = await api('POST', '/auth/login', {
        body: { employeeId: args[0], password: args[1] },
      });
      if (status !== 200) { console.error('LOGIN FAIL', status, JSON.stringify(data)); process.exit(1); }
      console.log(data.token);
      return;
    }

    case 'dash': {
      const r = await api('GET', '/dashboard/stats', { token: args[0] });
      console.log(JSON.stringify({ status: r.status, body: r.data }, null, 2));
      return;
    }

    case 'route': {
      const n = Number(args[2] || 10);
      const phaseName = args[3] || 'outbound';
      const points = Array.from({ length: n }, (_, i) => point(i, phaseName));
      const t0 = Date.now();
      const r = await api('POST', `/trips/${args[1]}/location/batch`, { token: args[0], body: { points } });
      console.log(JSON.stringify({ status: r.status, ms: Date.now() - t0, body: r.data }));
      return;
    }

    case 'routeget': {
      const r = await api('GET', `/trips/${args[1]}/route`, { token: args[0] });
      const o = (r.data && r.data.outbound) || [];
      const ret = (r.data && r.data.return) || [];
      console.log(JSON.stringify({
        status: r.status,
        outboundCount: o.length,
        returnCount: ret.length,
        first: o[0] || null,
        last: o[o.length - 1] || null,
      }));
      return;
    }

    case 'create': {
      const r = await api('POST', `/trips/${args[1]}/location`, {
        token: args[0], body: point(0, 'outbound'),
      });
      console.log(JSON.stringify({ status: r.status, body: r.data }));
      return;
    }

    case 'deact': {
      const r = await api('PATCH', `/users/${args[1]}`, { token: args[0], body: { isActive: false } });
      console.log(JSON.stringify({ status: r.status, body: r.data }));
      return;
    }

    case 'forge': {
      // Mint a token with a LIED role claim for a real userId — proves auth
      // reads role from the DB document, not from token claims.
      const jwt = require('../node_modules/jsonwebtoken');
      const mongoose = require('../node_modules/mongoose');
      await mongoose.connect(process.env.MONGO_URI, { dbName: 'innoset_costpass_test' });
      const User = require('../models/User');
      const u = await User.findOne({ employeeId: args[0] }).lean();
      await mongoose.disconnect();
      if (!u) { console.error('no such user'); process.exit(1); }
      console.log(jwt.sign(
        { userId: String(u._id), role: 'super_admin', branchId: null },
        process.env.FORGE_SECRET || 'local-test-secret-do-not-use',
        { expiresIn: '10m' },
      ));
      return;
    }

    case 'me': {
      const r = await api('GET', '/bills', { token: args[0] });
      console.log(JSON.stringify({ status: r.status, body: Array.isArray(r.data.bills) ? `{bills:${r.data.bills.length}}` : r.data }));
      return;
    }

    default:
      console.error('Unknown phase:', phase);
      process.exit(2);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
