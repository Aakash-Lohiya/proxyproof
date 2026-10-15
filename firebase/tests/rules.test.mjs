// Firestore security-rule tests. Run with `npm test` (starts the emulator) from firebase/.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, Timestamp, writeBatch, increment, serverTimestamp } from 'firebase/firestore';

const PROJECT = 'proxyproof-rules-test';
let env;

const ORG = { uid: 'org1', email: 'rao@vit.ac.in' };
const ASHA = { uid: 'asha', email: 'asha@vitstudent.ac.in' };
const BALA = { uid: 'bala', email: 'bala@vitstudent.ac.in' };
const OUTSIDER = { uid: 'x1', email: 'x@gmail.com' };

const db = (who) => env.authenticatedContext(who.uid, { email: who.email, email_verified: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

/** Seed data directly, bypassing rules. */
async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

const studentProfile = (p, extra = {}) => ({ name: 'Student', email: p.email, role: 'student', studentCode: '22BCE1', deviceId: `dev-${p.uid}`, deviceName: 'Phone', createdAt: 1, ...extra });
const organiserProfile = (p) => ({ name: 'Prof', email: p.email, role: 'organiser', studentCode: null, deviceId: null, deviceName: null, createdAt: 1 });

async function seedBasics(f) {
  await setDoc(doc(f, 'users', ORG.uid), organiserProfile(ORG));
  await setDoc(doc(f, 'users', ASHA.uid), studentProfile(ASHA));
  await setDoc(doc(f, 'users', BALA.uid), studentProfile(BALA));
  await setDoc(doc(f, 'courses', 'c1'), { name: 'DS', code: 'ABC123', organiserId: ORG.uid, organiserName: 'Prof', createdAt: 1, studentIds: [ASHA.uid], roster: { [ASHA.uid]: { name: 'Student' } } });
  await setDoc(doc(f, 'joinCodes', 'ABC123'), { courseId: 'c1', name: 'DS', organiserId: ORG.uid, organiserName: 'Prof' });
}

async function seedSession(f, overrides = {}) {
  await setDoc(doc(f, 'sessions', 'deadbeef'), {
    courseId: 'c1', organiserId: ORG.uid, studentIds: [ASHA.uid], startedAt: Date.now(),
    endsAt: Timestamp.fromMillis(Date.now() + 5 * 60_000), closedAt: null, presentCount: 0, rotationMs: 5000, rssiThreshold: -75, ...overrides,
  });
  await setDoc(doc(f, 'sessions', 'deadbeef', 'private', 'secret'), { secret: 'abc' });
}

// ---------------------------------------------------------------- users
test('profile role is dictated by the email domain', async () => {
  await assertSucceeds(setDoc(doc(db(ASHA), 'users', ASHA.uid), studentProfile(ASHA)));
  await assertFails(setDoc(doc(db(BALA), 'users', BALA.uid), studentProfile(BALA, { role: 'organiser' })));
  await assertFails(setDoc(doc(db(OUTSIDER), 'users', OUTSIDER.uid), studentProfile(OUTSIDER)));
  await assertSucceeds(setDoc(doc(db(ORG), 'users', ORG.uid), organiserProfile(ORG)));
  await assertFails(setDoc(doc(db(ORG), 'users', ORG.uid), { ...organiserProfile(ORG), role: 'student' }));
});

test('students must register a device and cannot rebind it themselves', async () => {
  await assertFails(setDoc(doc(db(BALA), 'users', BALA.uid), studentProfile(BALA, { deviceId: null })));
  await seed(seedBasics);
  await assertFails(updateDoc(doc(db(ASHA), 'users', ASHA.uid), { deviceId: 'other-phone' }));
  await assertSucceeds(updateDoc(doc(db(ASHA), 'users', ASHA.uid), { name: 'Asha V' }));
  await assertSucceeds(updateDoc(doc(db(ORG), 'users', ASHA.uid), { deviceId: 'other-phone', deviceName: 'New' }));
  await assertFails(updateDoc(doc(db(BALA), 'users', ASHA.uid), { deviceId: 'bala-phone' }));
});

test('a student with no device yet may bind one on first sign-in', async () => {
  await seed(async (f) => setDoc(doc(f, 'users', BALA.uid), studentProfile(BALA, { deviceId: null, deviceName: null })));
  await assertSucceeds(updateDoc(doc(db(BALA), 'users', BALA.uid), { deviceId: 'first', deviceName: 'P' }));
  await assertFails(updateDoc(doc(db(BALA), 'users', BALA.uid), { deviceId: 'second', deviceName: 'P' }));
});

test('students read only their own profile; organisers read all', async () => {
  await seed(seedBasics);
  await assertSucceeds(getDoc(doc(db(ASHA), 'users', ASHA.uid)));
  await assertFails(getDoc(doc(db(ASHA), 'users', BALA.uid)));
  await assertSucceeds(getDoc(doc(db(ORG), 'users', BALA.uid)));
  await assertSucceeds(getDocs(query(collection(db(ORG), 'users'), where('email', '==', BALA.email))));
  await assertFails(getDocs(collection(db(ASHA), 'users')));
});

// ------------------------------------------------------------ deviceRequests
test('device-switch requests: student files own, organiser resolves', async () => {
  await seed(seedBasics);
  await assertSucceeds(setDoc(doc(db(ASHA), 'deviceRequests', 'r1'), { userId: ASHA.uid, newDeviceId: 'new', newDeviceName: 'N', status: 'pending', createdAt: 1 }));
  await assertFails(setDoc(doc(db(ASHA), 'deviceRequests', 'r2'), { userId: BALA.uid, newDeviceId: 'new', status: 'pending', createdAt: 1 }));
  await assertFails(setDoc(doc(db(ASHA), 'deviceRequests', 'r3'), { userId: ASHA.uid, newDeviceId: 'new', status: 'approved', createdAt: 1 }));
  await assertFails(updateDoc(doc(db(ASHA), 'deviceRequests', 'r1'), { status: 'approved' }));
  await assertSucceeds(updateDoc(doc(db(ORG), 'deviceRequests', 'r1'), { status: 'approved', resolvedAt: 2, resolvedBy: ORG.uid }));
});

// ---------------------------------------------------------------- courses
test('organisers create courses; students join by adding exactly themselves', async () => {
  await seed(seedBasics);
  await assertSucceeds(setDoc(doc(db(ORG), 'courses', 'c2'), { name: 'OS', code: 'ZZZ999', organiserId: ORG.uid, organiserName: 'Prof', createdAt: 1, studentIds: [], roster: {} }));
  await assertFails(setDoc(doc(db(ASHA), 'courses', 'c3'), { name: 'X', code: 'ZZZ998', organiserId: ASHA.uid, organiserName: 'S', createdAt: 1, studentIds: [], roster: {} }));
  await assertSucceeds(getDoc(doc(db(BALA), 'joinCodes', 'ABC123')));
  // Bala joins c1
  await assertSucceeds(updateDoc(doc(db(BALA), 'courses', 'c1'), { studentIds: arrayUnion(BALA.uid), [`roster.${BALA.uid}`]: { name: 'Bala' } }));
  // cannot join twice, cannot add someone else, cannot rename
  await assertFails(updateDoc(doc(db(BALA), 'courses', 'c1'), { studentIds: arrayUnion(BALA.uid), [`roster.${BALA.uid}`]: { name: 'Bala2' } }));
  await assertFails(updateDoc(doc(db(ASHA), 'courses', 'c1'), { studentIds: arrayUnion('someone'), 'roster.someone': { name: 'S' } }));
  await assertFails(updateDoc(doc(db(BALA), 'courses', 'c1'), { name: 'Hacked' }));
  // reading
  await assertSucceeds(getDoc(doc(db(ASHA), 'courses', 'c1')));
  await assertFails(getDoc(doc(db(OUTSIDER), 'courses', 'c1')));
  await assertSucceeds(getDocs(query(collection(db(ASHA), 'courses'), where('studentIds', 'array-contains', ASHA.uid))));
  await assertFails(getDocs(collection(db(ASHA), 'courses')));
});

// --------------------------------------------------------------- sessions
test('only the course organiser can start and close a session', async () => {
  await seed(seedBasics);
  const s = { courseId: 'c1', organiserId: ORG.uid, studentIds: [ASHA.uid], startedAt: 1, endsAt: Timestamp.fromMillis(Date.now() + 60_000), closedAt: null, presentCount: 0 };
  await assertSucceeds(setDoc(doc(db(ORG), 'sessions', 'aaaa0001'), s));
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'aaaa0002'), { ...s, organiserId: ASHA.uid }));
  await assertSucceeds(updateDoc(doc(db(ORG), 'sessions', 'aaaa0001'), { closedAt: 2 }));
  await assertFails(updateDoc(doc(db(ASHA), 'sessions', 'aaaa0001'), { closedAt: 2 }));
  await assertFails(updateDoc(doc(db(ORG), 'sessions', 'aaaa0001'), { studentIds: [] }));
});

test('starting a session writes session + secret + course counter in one batch', async () => {
  await seed(seedBasics);
  const f = db(ORG);
  const batch = writeBatch(f);
  batch.set(doc(f, 'sessions', 'bbbb0001'), { courseId: 'c1', courseName: 'DS', organiserId: ORG.uid, studentIds: [ASHA.uid], startedAt: 1, endsAt: Timestamp.fromMillis(Date.now() + 60_000), closedAt: null, presentCount: 0, demo: true, demoToken: null, demoTokenAt: null });
  batch.set(doc(f, 'sessions', 'bbbb0001', 'private', 'secret'), { secret: 's', createdAt: serverTimestamp() });
  batch.update(doc(f, 'courses', 'c1'), { sessionCount: increment(1) });
  await assertSucceeds(batch.commit());
  // a student cannot sneak a secret in
  const g = db(ASHA);
  const b2 = writeBatch(g);
  b2.set(doc(g, 'sessions', 'bbbb0002', 'private', 'secret'), { secret: 's' });
  await assertFails(b2.commit());
  // demo token publishing by the organiser
  await assertSucceeds(updateDoc(doc(f, 'sessions', 'bbbb0001'), { demoToken: 'abcd1234', demoTokenAt: 2 }));
});

test('secret is readable by the organiser only', async () => {
  await seed(async (f) => { await seedBasics(f); await seedSession(f); });
  await assertSucceeds(getDoc(doc(db(ORG), 'sessions', 'deadbeef', 'private', 'secret')));
  await assertFails(getDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'private', 'secret')));
});

test('mark requests: bound device, enrolled, live session', async () => {
  await seed(async (f) => { await seedBasics(f); await seedSession(f); });
  const good = { userId: ASHA.uid, deviceId: 'dev-asha', token: 'abcd1234', rssi: -60, at: 1, status: 'pending' };
  await assertSucceeds(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), good));
  // wrong device (borrowed phone)
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), { ...good, deviceId: 'dev-bala' }));
  // writing someone else's request
  await assertFails(setDoc(doc(db(BALA), 'sessions', 'deadbeef', 'requests', ASHA.uid), good));
  // not enrolled
  await assertFails(setDoc(doc(db(BALA), 'sessions', 'deadbeef', 'requests', BALA.uid), { ...good, userId: BALA.uid, deviceId: 'dev-bala' }));
  // student cannot self-approve
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), { ...good, status: 'accepted' }));
  // organiser resolves
  await assertSucceeds(updateDoc(doc(db(ORG), 'sessions', 'deadbeef', 'requests', ASHA.uid), { status: 'rejected', reason: 'TOKEN_STALE', resolvedAt: 2 }));
  // student may retry after rejection (status back to pending)
  await assertSucceeds(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), { ...good, token: 'ffff0000' }));
  // organiser can read all requests, student only own
  await assertSucceeds(getDocs(collection(db(ORG), 'sessions', 'deadbeef', 'requests')));
  await assertFails(getDocs(collection(db(ASHA), 'sessions', 'deadbeef', 'requests')));
  await assertSucceeds(getDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid)));
});

test('mark requests are refused after the session ends or closes', async () => {
  const good = { userId: ASHA.uid, deviceId: 'dev-asha', token: 'abcd1234', rssi: -60, at: 1, status: 'pending' };
  await seed(async (f) => { await seedBasics(f); await seedSession(f, { endsAt: Timestamp.fromMillis(Date.now() - 1000) }); });
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), good));
  await seed(async (f) => { await seedBasics(f); await seedSession(f, { closedAt: Date.now() }); });
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'requests', ASHA.uid), good));
});

test('attendance is written by the organiser only; students read their own', async () => {
  await seed(async (f) => { await seedBasics(f); await seedSession(f); });
  const rec = { userId: ASHA.uid, name: 'Student', deviceId: 'dev-asha', markedAt: 1, method: 'auto', rssi: -60 };
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'attendance', ASHA.uid), rec));
  await assertSucceeds(setDoc(doc(db(ORG), 'sessions', 'deadbeef', 'attendance', ASHA.uid), rec));
  await assertSucceeds(getDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'attendance', ASHA.uid)));
  await assertFails(getDoc(doc(db(BALA), 'sessions', 'deadbeef', 'attendance', ASHA.uid)));
  await assertFails(getDocs(collection(db(ASHA), 'sessions', 'deadbeef', 'attendance')));
  await assertSucceeds(getDocs(collection(db(ORG), 'sessions', 'deadbeef', 'attendance')));
  await assertFails(deleteDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'attendance', ASHA.uid)));
  await assertSucceeds(deleteDoc(doc(db(ORG), 'sessions', 'deadbeef', 'attendance', ASHA.uid)));
  await assertSucceeds(setDoc(doc(db(ORG), 'sessions', 'deadbeef', 'attempts', 'a1'), { userId: ASHA.uid, reason: 'TOO_FAR', at: 1 }));
  await assertFails(setDoc(doc(db(ASHA), 'sessions', 'deadbeef', 'attempts', 'a2'), { userId: ASHA.uid, reason: 'TOO_FAR', at: 1 }));
});

test('students see sessions of their courses only', async () => {
  await seed(async (f) => { await seedBasics(f); await seedSession(f); });
  await assertSucceeds(getDoc(doc(db(ASHA), 'sessions', 'deadbeef')));
  await assertFails(getDoc(doc(db(BALA), 'sessions', 'deadbeef')));
  await assertSucceeds(getDocs(query(collection(db(ASHA), 'sessions'), where('studentIds', 'array-contains', ASHA.uid), where('closedAt', '==', null))));
  await assertFails(getDocs(collection(db(ASHA), 'sessions')));
});
