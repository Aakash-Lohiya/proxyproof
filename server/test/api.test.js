import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { tokenFor, windowFor, verifyToken } from '../src/token.js';

const JWT = 'test-secret';
let server, base, db;
const events = [];
const realtime = { emit: (room, event, payload) => events.push({ room, event, payload }) };

before(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, jwtSecret: JWT, realtime, simulateBeacon: true });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(method, path, { body, token, deviceId } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(deviceId ? { 'x-device-id': deviceId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv or empty */ }
  return { status: res.status, json, text, headers: res.headers };
}

const ctx = {};

test('token rotation: deterministic per window, verify accepts Â±1 window only', () => {
  const s = { secret: 'abc', short_id: 'deadbeef', rotation_ms: 5000 };
  const t = 1_700_000_000_000;
  const w = windowFor(t, 5000);
  const tok = tokenFor(s.secret, s.short_id, w);
  assert.equal(tok.length, 8);
  assert.equal(tokenFor(s.secret, s.short_id, w), tok);
  assert.notEqual(tokenFor(s.secret, s.short_id, w + 1), tok);
  assert.ok(verifyToken(s, tok, t));
  assert.ok(verifyToken(s, tok, t + 5000));      // next window still accepts (skew)
  assert.ok(verifyToken(s, tok, t - 5000));
  assert.ok(!verifyToken(s, tok, t + 10_000));   // two windows later: replay rejected
  assert.ok(!verifyToken(s, 'zzzzzzzz', t));
  assert.ok(!verifyToken(s, tok.slice(0, 7), t));
});

test('role comes from the email domain; other domains are refused', async () => {
  let r = await api('POST', '/api/auth/register', { body: { name: 'Nobody', email: 'x@gmail.com', password: 'secret1', deviceId: 'd' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'EMAIL_DOMAIN');
  r = await api('POST', '/api/auth/login', { body: { email: 'x@gmail.com', password: 'secret1' } });
  assert.equal(r.json.error, 'EMAIL_DOMAIN');
  r = await api('GET', '/api/auth/domains');
  assert.deepEqual(r.json, { student: 'vitstudent.ac.in', organiser: 'vit.ac.in' });
});

test('register organiser and students (device binding enforced)', async () => {
  let r = await api('POST', '/api/auth/register', { body: { name: 'Prof. Rao', email: 'rao@vit.ac.in', password: 'secret1', role: 'student' } });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'organiser', 'client-supplied role is ignored; vit.ac.in is an organiser');
  ctx.org = r.json.token;

  r = await api('POST', '/api/auth/register', { body: { name: 'Asha', email: 'asha@vitstudent.ac.in', password: 'secret1', studentCode: 'CS101' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'DEVICE_REQUIRED');

  r = await api('POST', '/api/auth/register', { body: { name: 'Asha', email: 'asha@vitstudent.ac.in', password: 'secret1', studentCode: 'CS101', deviceId: 'dev-asha', deviceName: 'Pixel 8' } });
  assert.equal(r.status, 201);
  ctx.asha = r.json.token; ctx.ashaId = r.json.user.id;

  r = await api('POST', '/api/auth/register', { body: { name: 'Bala', email: 'bala@vitstudent.ac.in', password: 'secret1', studentCode: 'CS102', deviceId: 'dev-asha' } });
  assert.equal(r.status, 409, 'same device cannot bind two students');
  assert.equal(r.json.error, 'DEVICE_TAKEN');

  r = await api('POST', '/api/auth/register', { body: { name: 'Bala', email: 'bala@vitstudent.ac.in', password: 'secret1', studentCode: 'CS102', deviceId: 'dev-bala' } });
  assert.equal(r.status, 201);
  ctx.bala = r.json.token; ctx.balaId = r.json.user.id;

  r = await api('POST', '/api/auth/register', { body: { name: 'Chen', email: 'chen@vitstudent.ac.in', password: 'secret1', studentCode: 'CS103', deviceId: 'dev-chen' } });
  ctx.chen = r.json.token; ctx.chenId = r.json.user.id;
});

test('login from a different device is refused and can request a switch', async () => {
  let r = await api('POST', '/api/auth/login', { body: { email: 'asha@vitstudent.ac.in', password: 'secret1', deviceId: 'other-phone' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'DEVICE_MISMATCH');
  assert.equal(r.json.pendingRequest, null);

  r = await api('POST', '/api/auth/device-change', { body: { email: 'asha@vitstudent.ac.in', password: 'secret1', newDeviceId: 'other-phone', newDeviceName: 'New phone' } });
  assert.equal(r.status, 201);
  ctx.devReq = r.json.request.id;

  r = await api('POST', '/api/auth/login', { body: { email: 'asha@vitstudent.ac.in', password: 'secret1', deviceId: 'other-phone' } });
  assert.equal(r.status, 403);
  assert.ok(r.json.pendingRequest, 'login reports the pending request');

  r = await api('GET', '/api/admin/device-requests', { token: ctx.org });
  assert.equal(r.json.requests.length, 1);
  r = await api('POST', `/api/admin/device-requests/${ctx.devReq}/reject`, { token: ctx.org });
  assert.equal(r.status, 200);

  r = await api('POST', '/api/auth/login', { body: { email: 'asha@vitstudent.ac.in', password: 'secret1', deviceId: 'dev-asha' } });
  assert.equal(r.status, 200, 'original device still works after rejection');
});

test('course creation and enrollment by join code', async () => {
  let r = await api('POST', '/api/courses', { token: ctx.org, body: { name: 'Distributed Systems' } });
  assert.equal(r.status, 201);
  ctx.course = r.json.course;
  assert.match(ctx.course.code, /^[A-Z2-9]{6}$/);

  r = await api('POST', '/api/courses/join', { token: ctx.asha, body: { code: ctx.course.code.toLowerCase() } });
  assert.equal(r.status, 200);
  r = await api('POST', '/api/courses/join', { token: ctx.bala, body: { code: ctx.course.code } });
  assert.equal(r.status, 200);
  // chen is NOT enrolled
  r = await api('POST', '/api/courses/join', { token: ctx.bala, body: { code: 'NOPE22' } });
  assert.equal(r.status, 404);

  r = await api('GET', `/api/courses/${ctx.course.id}`, { token: ctx.org });
  assert.equal(r.json.roster.length, 2);
});

test('organiser starts a session and receives secret + current token', async () => {
  let r = await api('POST', '/api/sessions', { token: ctx.asha, body: { courseId: ctx.course.id } });
  assert.equal(r.status, 403, 'students cannot start sessions');

  r = await api('POST', '/api/sessions', { token: ctx.org, body: { courseId: ctx.course.id, durationSec: 300, title: 'Lecture 1' } });
  assert.equal(r.status, 201);
  ctx.session = r.json.session;
  ctx.secret = r.json.secret;
  assert.equal(ctx.session.active, true);
  assert.equal(ctx.session.rotationMs, 5000);
  assert.equal(ctx.session.rssiThreshold, -75);
  assert.match(ctx.session.shortId, /^[0-9a-f]{8}$/);
  assert.equal(r.json.token, tokenFor(ctx.secret, ctx.session.shortId, windowFor(r.json.serverTime, 5000)));

  r = await api('POST', '/api/sessions', { token: ctx.org, body: { courseId: ctx.course.id } });
  assert.equal(r.status, 409, 'one active session per course');
});

const liveToken = () => tokenFor(ctx.secret, ctx.session.shortId, windowFor(Date.now(), 5000));

test('mark: every anti-proxy rule is enforced', async () => {
  const sid = ctx.session.shortId;

  // stale / shared / fabricated token
  let r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: sid, token: '00000000', rssi: -50 } });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'TOKEN_STALE');

  // replayed token from 3 windows ago
  const old = tokenFor(ctx.secret, sid, windowFor(Date.now(), 5000) - 3);
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: sid, token: old, rssi: -50 } });
  assert.equal(r.json.error, 'TOKEN_STALE');

  // wrong device
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-bala', body: { shortId: sid, token: liveToken(), rssi: -50 } });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'DEVICE_MISMATCH');

  // missing device header
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, body: { shortId: sid, token: liveToken(), rssi: -50 } });
  assert.equal(r.json.error, 'DEVICE_MISMATCH');

  // not enrolled
  r = await api('POST', '/api/sessions/mark', { token: ctx.chen, deviceId: 'dev-chen', body: { shortId: sid, token: liveToken(), rssi: -50 } });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'NOT_ENROLLED');

  // too far away
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: sid, token: liveToken(), rssi: -90 } });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'TOO_FAR');

  // unknown session
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: 'ffffffff', token: liveToken(), rssi: -50 } });
  assert.equal(r.status, 404);

  // all good
  events.length = 0;
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: sid, token: liveToken(), rssi: -60 } });
  assert.equal(r.status, 201);
  assert.equal(r.json.marked, true);
  assert.equal(r.json.attendance.method, 'auto');
  assert.equal(r.json.course.name, 'Distributed Systems');
  assert.equal(r.json.session.title, 'Lecture 1');
  assert.equal(events[0].event, 'attendance:marked');
  assert.equal(events[0].room, sid);

  // idempotent re-mark
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: sid, token: liveToken(), rssi: -60 } });
  assert.equal(r.status, 200); assert.equal(r.json.alreadyMarked, true);

  // rejected attempts were logged for the dashboard
  r = await api('GET', `/api/sessions/${ctx.session.id}`, { token: ctx.org });
  assert.equal(r.status, 200);
  assert.equal(r.json.attendance.length, 1);
  assert.equal(r.json.absent.length, 1);
  assert.equal(r.json.absent[0].id, ctx.balaId);
  assert.ok(r.json.attempts.length >= 5);
  assert.ok(r.json.secret, 'organiser gets the secret while the session is live');
});

test('one device cannot mark two students even with a valid token', async () => {
  // Simulate Bala's account somehow being used with Asha's device: the JWT is
  // bound to dev-bala, so sending dev-asha fails DEVICE_MISMATCH. To exercise
  // the DEVICE_ALREADY_USED rule we rebind Bala's device to dev-asha directly.
  db.prepare('UPDATE users SET device_id = NULL WHERE id = ?').run(ctx.ashaId);
  db.prepare('UPDATE users SET device_id = ? WHERE id = ?').run('dev-asha', ctx.balaId);
  const login = await api('POST', '/api/auth/login', { body: { email: 'bala@vitstudent.ac.in', password: 'secret1', deviceId: 'dev-asha' } });
  assert.equal(login.status, 200);
  const r = await api('POST', '/api/sessions/mark', { token: login.json.token, deviceId: 'dev-asha', body: { shortId: ctx.session.shortId, token: liveToken(), rssi: -60 } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'DEVICE_ALREADY_USED');
  // restore
  db.prepare('UPDATE users SET device_id = ? WHERE id = ?').run('dev-bala', ctx.balaId);
  db.prepare('UPDATE users SET device_id = ? WHERE id = ?').run('dev-asha', ctx.ashaId);
});

test('old JWT is rejected after a device rebind', async () => {
  // token issued for dev-bala no longer matches once binding moved
  db.prepare('UPDATE users SET device_id = ? WHERE id = ?').run('dev-bala-2', ctx.balaId);
  const r = await api('GET', '/api/auth/me', { token: ctx.bala });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'DEVICE_REBOUND');
  db.prepare('UPDATE users SET device_id = ? WHERE id = ?').run('dev-bala', ctx.balaId);
});

test('simulated beacon endpoint returns the live token (dev mode)', async () => {
  const r = await api('GET', '/api/sessions/dev/beacon', { token: ctx.bala });
  assert.equal(r.status, 200);
  assert.equal(r.json.beacons.length, 1);
  assert.equal(r.json.beacons[0].shortId, ctx.session.shortId);
  assert.ok(verifyToken({ secret: ctx.secret, short_id: ctx.session.shortId, rotation_ms: 5000 }, r.json.beacons[0].token));
});

test('manual add / remove and live events', async () => {
  events.length = 0;
  let r = await api('POST', `/api/sessions/${ctx.session.id}/attendance`, { token: ctx.org, body: { userId: ctx.balaId } });
  assert.equal(r.status, 201);
  assert.equal(r.json.attendance.method, 'manual');
  assert.equal(events.at(-1).event, 'attendance:marked');

  r = await api('POST', `/api/sessions/${ctx.session.id}/attendance`, { token: ctx.org, body: { userId: ctx.chenId } });
  assert.equal(r.status, 400, 'cannot manually add an unenrolled student');

  r = await api('DELETE', `/api/sessions/${ctx.session.id}/attendance/${ctx.balaId}`, { token: ctx.org });
  assert.equal(r.json.removed, true);
  assert.equal(events.at(-1).event, 'attendance:removed');

  // add back for history checks
  await api('POST', `/api/sessions/${ctx.session.id}/attendance`, { token: ctx.org, body: { userId: ctx.balaId } });
});

test('CSV export lists the whole roster', async () => {
  const r = await api('GET', `/api/sessions/${ctx.session.id}/export.csv`, { token: ctx.org });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const lines = r.text.trim().split('\r\n');
  assert.equal(lines[0], '"Student Code","Name","Email","Status","Marked At","Method","RSSI"');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"Asha".*"Present".*"auto","-60"/);
  assert.match(lines[2], /"Bala".*"Present".*"manual",$/);
});

test('close session: marks refused afterwards, history + percentage computed', async () => {
  events.length = 0;
  let r = await api('POST', `/api/sessions/${ctx.session.id}/close`, { token: ctx.org });
  assert.equal(r.json.session.active, false);
  assert.equal(events.at(-1).event, 'session:closed');

  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: ctx.session.shortId, token: liveToken(), rssi: -60 } });
  assert.equal(r.status, 410); assert.equal(r.json.error, 'SESSION_ENDED');

  // second session where only Asha attends
  r = await api('POST', '/api/sessions', { token: ctx.org, body: { courseId: ctx.course.id, durationSec: 60 } });
  const s2 = r.json.session; const secret2 = r.json.secret;
  const tok2 = tokenFor(secret2, s2.shortId, windowFor(Date.now(), 5000));
  r = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: s2.shortId, token: tok2, rssi: -70 } });
  assert.equal(r.status, 201);
  await api('POST', `/api/sessions/${s2.id}/close`, { token: ctx.org });

  r = await api('GET', '/api/attendance/me', { token: ctx.asha });
  assert.equal(r.json.overall.percentage, 100);
  r = await api('GET', '/api/attendance/me', { token: ctx.bala });
  assert.equal(r.json.courses[0].total, 2);
  assert.equal(r.json.courses[0].present, 1);
  assert.equal(r.json.courses[0].percentage, 50);
  assert.equal(r.json.courses[0].sessions[0].present, false);

  r = await api('GET', `/api/attendance/course/${ctx.course.id}`, { token: ctx.org });
  const bala = r.json.students.find((x) => x.student.id === ctx.balaId);
  assert.equal(bala.percentage, 50);
});

test('expired sessions are auto-closed by timer', async () => {
  const r = await api('POST', '/api/sessions', { token: ctx.org, body: { courseId: ctx.course.id, durationSec: 30 } });
  const s = r.json.session;
  // fast-forward: rewrite ends_at into the past and let the recovery path close it
  db.prepare('UPDATE sessions SET ends_at = ? WHERE id = ?').run(Date.now() - 1, s.id);
  const m = await api('POST', '/api/sessions/mark', { token: ctx.asha, deviceId: 'dev-asha', body: { shortId: s.shortId, token: 'deadbeef', rssi: -60 } });
  assert.equal(m.json.error, 'SESSION_ENDED');
  await api('POST', `/api/sessions/${s.id}/close`, { token: ctx.org });
});
