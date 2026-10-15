// Firestore-backed data layer. Replaces the former REST client with the same method names,
// so screens keep calling `api.*`. Security rules (firebase/firestore.rules) are the real
// gatekeeper; this module just shapes reads and writes.
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser, User as FbUser,
} from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit,
  arrayUnion, arrayRemove, deleteField, increment, writeBatch, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './app';
import { roleForEmail } from '../roles';
import { newSecret, newShortId } from '../token';

// ---- Types (unchanged public surface) ----------------------------------------
export type Role = 'student' | 'organiser';
export type User = {
  id: string; name: string; email: string; role: Role;
  studentCode: string | null; deviceId: string | null; deviceName: string | null; createdAt: number;
};
export type RosterEntry = { name: string; email: string; studentCode: string | null; deviceName: string | null };
export type Course = {
  id: string; name: string; code: string; organiserId: string; organiserName: string | null;
  createdAt: number; studentCount: number; sessionCount: number; studentIds: string[]; roster: Record<string, RosterEntry>;
};
export type SessionSummary = {
  id: string; shortId: string; courseId: string; courseName: string; title: string | null;
  startedAt: number; endsAt: number; closedAt: number | null; durationSec: number;
  rotationMs: number; rssiThreshold: number; active: boolean; presentCount: number; enrolledCount: number;
  demo: boolean; demoToken?: string | null;
};
export type Attendance = {
  id: string; sessionId: string; userId: string; deviceId: string | null; markedAt: number;
  method: 'auto' | 'manual'; rssi: number | null; student: { id: string; name: string; email: string; studentCode: string | null };
};
export type Attempt = {
  id: string; reason: string; message: string; rssi: number | null; at: number;
  student: { id: string; name: string; studentCode: string | null } | null;
};
export type SessionDetail = {
  session: SessionSummary;
  course: { id: string; name: string; code: string; roster: Record<string, RosterEntry> };
  attendance?: Attendance[];
  absent?: User[];
  attempts?: Attempt[];
  secret?: string;
  myAttendance?: Attendance | null;
};
export type DeviceRequest = {
  id: string; status: 'pending' | 'approved' | 'rejected'; createdAt: number; resolvedAt: number | null;
  newDeviceName: string | null; currentDeviceName: string | null;
  student: { id: string; name: string; email: string; studentCode: string | null };
};
export type StudentHistory = {
  courses: {
    course: { id: string; name: string; code: string };
    total: number; present: number; percentage: number | null;
    sessions: (SessionSummary & { present: boolean; markedAt: number | null; method: string | null })[];
  }[];
  overall: { total: number; present: number; percentage: number | null };
};

export const REJECT_REASONS: Record<string, string> = {
  SESSION_NOT_FOUND: 'No active session with that id',
  SESSION_ENDED: 'The session has ended',
  NOT_ENROLLED: 'You are not enrolled in this course',
  DEVICE_MISMATCH: 'Request did not come from your registered device',
  DEVICE_ALREADY_USED: 'This device already marked another student in this session',
  TOKEN_STALE: 'Token is stale or invalid (replayed or shared code)',
  TOO_FAR: 'Signal too weak: you do not appear to be in the room',
};

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Turns Firebase errors into the ApiError shape the screens already understand. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, [number, string, string]> = {
    'auth/invalid-credential': [401, 'BAD_CREDENTIALS', 'Email or password is incorrect'],
    'auth/wrong-password': [401, 'BAD_CREDENTIALS', 'Email or password is incorrect'],
    'auth/user-not-found': [401, 'BAD_CREDENTIALS', 'Email or password is incorrect'],
    'auth/invalid-email': [400, 'VALIDATION', 'Invalid email'],
    'auth/email-already-in-use': [409, 'EMAIL_TAKEN', 'An account with this email already exists'],
    'auth/weak-password': [400, 'VALIDATION', 'Password must be at least 6 characters'],
    'auth/network-request-failed': [0, 'NETWORK', 'Cannot reach Firebase. Check your internet connection.'],
    'auth/too-many-requests': [429, 'RATE_LIMIT', 'Too many attempts, try again later'],
    'permission-denied': [403, 'FORBIDDEN', 'Not allowed'],
    'unavailable': [0, 'NETWORK', 'Firestore is unreachable. Check your internet connection.'],
  };
  const m = map[code];
  if (m) return new ApiError(m[0], m[1], m[2]);
  return new ApiError(500, code || 'INTERNAL', (e as Error)?.message || 'Something went wrong');
}

// ---- helpers ------------------------------------------------------------------
const now = () => Date.now();
const uidOrThrow = () => {
  const u = auth.currentUser;
  if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in first');
  return u.uid;
};
const ms = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const joinCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

function userFromDoc(id: string, d: any): User {
  return { id, name: d.name, email: d.email, role: d.role, studentCode: d.studentCode ?? null, deviceId: d.deviceId ?? null, deviceName: d.deviceName ?? null, createdAt: d.createdAt ?? 0 };
}
function courseFromDoc(id: string, d: any): Course {
  const studentIds: string[] = d.studentIds ?? [];
  return {
    id, name: d.name, code: d.code, organiserId: d.organiserId, organiserName: d.organiserName ?? null, createdAt: d.createdAt ?? 0,
    studentCount: studentIds.length, sessionCount: d.sessionCount ?? 0, studentIds, roster: d.roster ?? {},
  };
}
export function sessionFromDoc(id: string, d: any): SessionSummary {
  const endsAt = ms(d.endsAt);
  const closedAt = d.closedAt == null ? null : ms(d.closedAt);
  return {
    id, shortId: id, courseId: d.courseId, courseName: d.courseName ?? '', title: d.title ?? null,
    startedAt: ms(d.startedAt), endsAt, closedAt, durationSec: d.durationSec ?? Math.round((endsAt - ms(d.startedAt)) / 1000),
    rotationMs: d.rotationMs ?? 5000, rssiThreshold: d.rssiThreshold ?? -75,
    active: closedAt === null && now() < endsAt, presentCount: d.presentCount ?? 0, enrolledCount: (d.studentIds ?? []).length,
    demo: !!d.demo, demoToken: d.demoToken ?? null,
  };
}
export function attendanceFromDoc(sessionId: string, id: string, d: any): Attendance {
  return {
    id: `${sessionId}:${id}`, sessionId, userId: id, deviceId: d.deviceId ?? null, markedAt: ms(d.markedAt), method: d.method, rssi: d.rssi ?? null,
    student: { id, name: d.name, email: d.email ?? '', studentCode: d.studentCode ?? null },
  };
}
export function attemptFromDoc(id: string, d: any): Attempt {
  return { id, reason: d.reason, message: REJECT_REASONS[d.reason] ?? d.reason, rssi: d.rssi ?? null, at: ms(d.at), student: d.userId ? { id: d.userId, name: d.name ?? 'Unknown', studentCode: d.studentCode ?? null } : null };
}
function requestFromDoc(id: string, d: any): DeviceRequest {
  return { id, status: d.status, createdAt: d.createdAt ?? 0, resolvedAt: d.resolvedAt ?? null, newDeviceName: d.newDeviceName ?? null, currentDeviceName: d.currentDeviceName ?? null, student: { id: d.userId, name: d.name ?? '', email: d.email ?? '', studentCode: d.studentCode ?? null } };
}

async function getUser(id: string): Promise<User | null> {
  const s = await getDoc(doc(db, 'users', id));
  return s.exists() ? userFromDoc(s.id, s.data()) : null;
}

async function pendingDeviceRequest(userId: string) {
  const q = query(collection(db, 'deviceRequests'), where('userId', '==', userId), where('status', '==', 'pending'), limit(1));
  const s = await getDocs(q);
  return s.empty ? null : { id: s.docs[0].id, createdAt: s.docs[0].data().createdAt as number };
}

/** Compare the signed-in student's bound device with this phone. Throws DEVICE_MISMATCH and signs out. */
async function enforceDevice(user: User, deviceId: string, deviceName: string): Promise<User> {
  if (user.role !== 'student') return user;
  if (!user.deviceId) {
    await updateDoc(doc(db, 'users', user.id), { deviceId, deviceName });
    return { ...user, deviceId, deviceName };
  }
  if (user.deviceId !== deviceId) {
    const pending = await pendingDeviceRequest(user.id).catch(() => null);
    await signOut(auth);
    throw new ApiError(403, 'DEVICE_MISMATCH', 'This account is bound to a different device. Request a device switch.', { boundDeviceName: user.deviceName, pendingRequest: pending });
  }
  return user;
}

// ---- API -----------------------------------------------------------------------
export const api = {
  async register(b: { name: string; email: string; password: string; studentCode?: string; deviceId?: string; deviceName?: string }) {
    const email = b.email.trim().toLowerCase();
    const role = roleForEmail(email);
    if (!role) throw new ApiError(400, 'EMAIL_DOMAIN', 'Use your institute email (@vitstudent.ac.in for students, @vit.ac.in for organisers)');
    let fb: FbUser;
    try { fb = (await createUserWithEmailAndPassword(auth, email, b.password)).user; } catch (e) { throw toApiError(e); }
    const profile = {
      name: b.name.trim(), email, role, studentCode: role === 'student' ? (b.studentCode?.trim() || null) : null,
      deviceId: role === 'student' ? b.deviceId ?? null : null, deviceName: role === 'student' ? b.deviceName ?? null : null, createdAt: now(),
    };
    try {
      await setDoc(doc(db, 'users', fb.uid), profile);
    } catch (e) {
      // Don't leave an auth user without a profile behind.
      await deleteUser(fb).catch(() => {});
      throw toApiError(e);
    }
    return { user: userFromDoc(fb.uid, profile) };
  },

  async login(b: { email: string; password: string; deviceId?: string; deviceName?: string }) {
    const email = b.email.trim().toLowerCase();
    if (!roleForEmail(email)) throw new ApiError(400, 'EMAIL_DOMAIN', 'Use your institute email (@vitstudent.ac.in for students, @vit.ac.in for organisers)');
    let fb: FbUser;
    try { fb = (await signInWithEmailAndPassword(auth, email, b.password)).user; } catch (e) { throw toApiError(e); }
    const user = await getUser(fb.uid);
    if (!user) { await signOut(auth); throw new ApiError(404, 'NO_PROFILE', 'Account has no profile. Register again.'); }
    if (user.role === 'student' && !b.deviceId) throw new ApiError(400, 'DEVICE_REQUIRED', 'deviceId is required for students');
    return { user: await enforceDevice(user, b.deviceId ?? '', b.deviceName ?? '') };
  },

  async deviceChange(b: { email: string; password: string; newDeviceId: string; newDeviceName: string }) {
    let fb: FbUser;
    try { fb = (await signInWithEmailAndPassword(auth, b.email.trim().toLowerCase(), b.password)).user; } catch (e) { throw toApiError(e); }
    try {
      const user = await getUser(fb.uid);
      if (!user || user.role !== 'student') throw new ApiError(400, 'NOT_STUDENT', 'Only student accounts are device bound');
      if (user.deviceId === b.newDeviceId) throw new ApiError(400, 'SAME_DEVICE', 'This device is already your bound device');
      const pending = await pendingDeviceRequest(user.id);
      if (pending) return { request: { id: pending.id, status: 'pending' }, alreadyPending: true };
      const ref = await addDoc(collection(db, 'deviceRequests'), {
        userId: user.id, name: user.name, email: user.email, studentCode: user.studentCode, currentDeviceName: user.deviceName,
        newDeviceId: b.newDeviceId, newDeviceName: b.newDeviceName, status: 'pending', createdAt: now(), resolvedAt: null, resolvedBy: null,
      });
      return { request: { id: ref.id, status: 'pending' }, alreadyPending: false };
    } finally {
      await signOut(auth);
    }
  },

  async me() {
    const user = await getUser(uidOrThrow());
    if (!user) throw new ApiError(404, 'NO_PROFILE', 'Profile missing');
    return { user };
  },

  async signOut() { await signOut(auth); },

  // ---- courses ----
  async courses() {
    const me = await this.me();
    const q = me.user.role === 'organiser'
      ? query(collection(db, 'courses'), where('organiserId', '==', me.user.id), orderBy('createdAt', 'desc'))
      : query(collection(db, 'courses'), where('studentIds', 'array-contains', me.user.id));
    const s = await getDocs(q);
    const courses = s.docs.map((d) => courseFromDoc(d.id, d.data()));
    if (me.user.role === 'student') courses.sort((a, b) => b.createdAt - a.createdAt);
    return { courses };
  },

  async createCourse(name: string) {
    const me = (await this.me()).user;
    const code = joinCode();
    const ref = doc(collection(db, 'courses'));
    const data = { name: name.trim(), code, organiserId: me.id, organiserName: me.name, createdAt: now(), studentIds: [] as string[], roster: {}, sessionCount: 0 };
    const batch = writeBatch(db);
    batch.set(ref, data);
    batch.set(doc(db, 'joinCodes', code), { courseId: ref.id, name: data.name, organiserId: me.id, organiserName: me.name });
    await batch.commit();
    return { course: courseFromDoc(ref.id, data) };
  },

  async joinCourse(code: string) {
    const me = (await this.me()).user;
    const jc = await getDoc(doc(db, 'joinCodes', code.trim().toUpperCase()));
    if (!jc.exists()) throw new ApiError(404, 'COURSE_NOT_FOUND', 'No course with that join code');
    const courseId = jc.data().courseId as string;
    const entry: RosterEntry = { name: me.name, email: me.email, studentCode: me.studentCode, deviceName: me.deviceName };
    try {
      await updateDoc(doc(db, 'courses', courseId), { studentIds: arrayUnion(me.id), [`roster.${me.id}`]: entry });
    } catch (e) {
      // Already a member: the rules refuse a no-op join; treat as success.
      const c = await getDoc(doc(db, 'courses', courseId)).catch(() => null);
      if (!c?.exists()) throw toApiError(e);
    }
    const c = await getDoc(doc(db, 'courses', courseId));
    return { course: courseFromDoc(c.id, c.data()) };
  },

  async course(id: string) {
    const me = (await this.me()).user;
    const c = await getDoc(doc(db, 'courses', id));
    if (!c.exists()) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course not found');
    const course = courseFromDoc(c.id, c.data());
    const q = me.role === 'organiser'
      ? query(collection(db, 'sessions'), where('courseId', '==', id), where('organiserId', '==', me.id), orderBy('startedAt', 'desc'))
      : query(collection(db, 'sessions'), where('courseId', '==', id), where('studentIds', 'array-contains', me.id), orderBy('startedAt', 'desc'));
    const s = await getDocs(q);
    const sessions = s.docs.map((d) => sessionFromDoc(d.id, d.data()));
    const roster: User[] | undefined = me.role === 'organiser'
      ? Object.entries(course.roster).map(([uid, r]) => ({ id: uid, name: r.name, email: r.email, role: 'student' as Role, studentCode: r.studentCode, deviceId: null, deviceName: r.deviceName, createdAt: 0 })).sort((a, b) => a.name.localeCompare(b.name))
      : undefined;
    return { course, roster, sessions };
  },

  async enroll(courseId: string, email: string) {
    const s = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()), limit(1)));
    if (s.empty || s.docs[0].data().role !== 'student') throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No student account with that email');
    const u = userFromDoc(s.docs[0].id, s.docs[0].data());
    const entry: RosterEntry = { name: u.name, email: u.email, studentCode: u.studentCode, deviceName: u.deviceName };
    await updateDoc(doc(db, 'courses', courseId), { studentIds: arrayUnion(u.id), [`roster.${u.id}`]: entry });
    return { student: u };
  },

  async unenroll(courseId: string, userId: string) {
    await updateDoc(doc(db, 'courses', courseId), { studentIds: arrayRemove(userId), [`roster.${userId}`]: deleteField() });
    return { ok: true };
  },

  // ---- sessions ----
  async startSession(b: { courseId: string; title?: string; durationSec: number; rssiThreshold?: number; rotationMs?: number; demo?: boolean }) {
    const me = (await this.me()).user;
    const c = await getDoc(doc(db, 'courses', b.courseId));
    if (!c.exists()) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course not found');
    const course = courseFromDoc(c.id, c.data());
    const open = await getDocs(query(collection(db, 'sessions'), where('courseId', '==', b.courseId), where('organiserId', '==', me.id), where('closedAt', '==', null)));
    if (open.docs.some((d) => sessionFromDoc(d.id, d.data()).active)) throw new ApiError(409, 'SESSION_ALREADY_ACTIVE', 'This course already has an active session');
    const dur = Math.min(Math.max(b.durationSec || 300, 30), 3 * 3600);
    const rot = Math.min(Math.max(b.rotationMs || 5000, 2000), 30000);
    const shortId = newShortId();
    const secret = newSecret();
    const t = now();
    const data = {
      courseId: course.id, courseName: course.name, organiserId: me.id, title: b.title?.trim() || null,
      startedAt: t, endsAt: Timestamp.fromMillis(t + dur * 1000), closedAt: null, durationSec: dur, rotationMs: rot,
      rssiThreshold: Number.isFinite(Number(b.rssiThreshold)) ? Number(b.rssiThreshold) : -75,
      studentIds: course.studentIds, presentCount: 0, demo: !!b.demo, demoToken: null, demoTokenAt: null,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, 'sessions', shortId), data);
    batch.set(doc(db, 'sessions', shortId, 'private', 'secret'), { secret, createdAt: serverTimestamp() });
    batch.update(doc(db, 'courses', course.id), { sessionCount: increment(1) });
    await batch.commit();
    return { session: sessionFromDoc(shortId, data), secret };
  },

  async session(id: string): Promise<SessionDetail> {
    const me = (await this.me()).user;
    const s = await getDoc(doc(db, 'sessions', id));
    if (!s.exists()) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
    const session = sessionFromDoc(s.id, s.data());
    const c = await getDoc(doc(db, 'courses', session.courseId));
    const course = c.exists() ? courseFromDoc(c.id, c.data()) : null;
    const out: SessionDetail = { session, course: { id: session.courseId, name: course?.name ?? session.courseName, code: course?.code ?? '', roster: course?.roster ?? {} } };
    if (me.role === 'organiser' && s.data().organiserId === me.id) {
      const [att, attempts, secret] = await Promise.all([
        getDocs(collection(db, 'sessions', id, 'attendance')),
        getDocs(query(collection(db, 'sessions', id, 'attempts'), orderBy('at', 'desc'), limit(50))),
        session.active ? getDoc(doc(db, 'sessions', id, 'private', 'secret')) : Promise.resolve(null),
      ]);
      out.attendance = att.docs.map((d) => attendanceFromDoc(id, d.id, d.data())).sort((a, b) => a.markedAt - b.markedAt);
      const present = new Set(out.attendance.map((a) => a.userId));
      out.absent = Object.entries(out.course.roster).filter(([uid]) => !present.has(uid))
        .map(([uid, r]) => ({ id: uid, name: r.name, email: r.email, role: 'student' as Role, studentCode: r.studentCode, deviceId: null, deviceName: r.deviceName, createdAt: 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      out.attempts = attempts.docs.map((d) => attemptFromDoc(d.id, d.data()));
      if (secret?.exists()) out.secret = secret.data().secret;
    } else {
      const mine = await getDoc(doc(db, 'sessions', id, 'attendance', me.id)).catch(() => null);
      out.myAttendance = mine?.exists() ? attendanceFromDoc(id, mine.id, mine.data()) : null;
    }
    return out;
  },

  /** Organiser: every session I ran, newest first (live ones included). */
  async mySessions(max = 30) {
    const me = (await this.me()).user;
    const s = await getDocs(query(collection(db, 'sessions'), where('organiserId', '==', me.id), orderBy('startedAt', 'desc'), limit(max)));
    return { sessions: s.docs.map((d) => sessionFromDoc(d.id, d.data())) };
  },

  async closeSession(id: string) {
    await updateDoc(doc(db, 'sessions', id), { closedAt: now() });
    const s = await getDoc(doc(db, 'sessions', id));
    return { session: sessionFromDoc(s.id, s.data()) };
  },

  async manualMark(id: string, userId: string) {
    const existing = await getDoc(doc(db, 'sessions', id, 'attendance', userId));
    if (existing.exists()) return { attendance: attendanceFromDoc(id, userId, existing.data()), alreadyMarked: true };
    const s = await getDoc(doc(db, 'sessions', id));
    const c = await getDoc(doc(db, 'courses', s.data()?.courseId));
    const r: RosterEntry | undefined = c.data()?.roster?.[userId];
    if (!r) throw new ApiError(400, 'NOT_ENROLLED', 'That student is not enrolled in this course');
    const rec = { userId, name: r.name, email: r.email, studentCode: r.studentCode, deviceId: null, markedAt: now(), method: 'manual', rssi: null };
    const batch = writeBatch(db);
    batch.set(doc(db, 'sessions', id, 'attendance', userId), rec);
    batch.update(doc(db, 'sessions', id), { presentCount: increment(1) });
    await batch.commit();
    return { attendance: attendanceFromDoc(id, userId, rec), alreadyMarked: false };
  },

  async removeMark(id: string, userId: string) {
    const existing = await getDoc(doc(db, 'sessions', id, 'attendance', userId));
    if (!existing.exists()) return { removed: false };
    const batch = writeBatch(db);
    batch.delete(doc(db, 'sessions', id, 'attendance', userId));
    batch.update(doc(db, 'sessions', id), { presentCount: increment(-1) });
    await batch.commit();
    return { removed: true };
  },

  async exportCsv(id: string) {
    const d = await this.session(id);
    const marks = new Map((d.attendance ?? []).map((a) => [a.userId, a]));
    const esc = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const lines = [['Student Code', 'Name', 'Email', 'Status', 'Marked At', 'Method', 'RSSI'].map(esc).join(',')];
    for (const [uid, r] of Object.entries(d.course.roster).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const a = marks.get(uid);
      lines.push([r.studentCode, r.name, r.email, a ? 'Present' : 'Absent', a ? new Date(a.markedAt).toISOString() : '', a?.method ?? '', a?.rssi ?? ''].map(esc).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  },

  /** Student: ask the organiser's phone to verify this beacon sighting. Resolution arrives via live.ts. */
  async requestMark(b: { shortId: string; token: string; rssi: number }, deviceId: string) {
    const uid = uidOrThrow();
    let s;
    try { s = await getDoc(doc(db, 'sessions', b.shortId)); } catch (e) {
      const err = toApiError(e);
      throw err.code === 'FORBIDDEN' ? new ApiError(403, 'NOT_ENROLLED', REJECT_REASONS.NOT_ENROLLED) : err;
    }
    if (!s.exists()) throw new ApiError(404, 'SESSION_NOT_FOUND', REJECT_REASONS.SESSION_NOT_FOUND);
    const session = sessionFromDoc(s.id, s.data());
    if (!session.active) throw new ApiError(410, 'SESSION_ENDED', REJECT_REASONS.SESSION_ENDED);
    try {
      await setDoc(doc(db, 'sessions', b.shortId, 'requests', uid), {
        userId: uid, deviceId, token: b.token.toLowerCase(), rssi: Math.round(b.rssi), at: now(), status: 'pending', reason: null, resolvedAt: null,
      });
    } catch (e) {
      const err = toApiError(e);
      throw err.code === 'FORBIDDEN' ? new ApiError(403, 'DEVICE_MISMATCH', REJECT_REASONS.DEVICE_MISMATCH) : err;
    }
    return { session };
  },

  /** Student, demo mode only: sessions of my courses that publish their token (no BLE hardware). */
  async demoBeacons() {
    const uid = uidOrThrow();
    const s = await getDocs(query(collection(db, 'sessions'), where('studentIds', 'array-contains', uid), where('closedAt', '==', null)));
    return s.docs.map((d) => sessionFromDoc(d.id, d.data())).filter((x) => x.active && x.demo && x.demoToken)
      .map((x) => ({ shortId: x.shortId, token: x.demoToken as string, rssi: -55 - Math.floor(Math.random() * 10) }));
  },

  // ---- history ----
  async myHistory(): Promise<StudentHistory> {
    const me = (await this.me()).user;
    const cs = await getDocs(query(collection(db, 'courses'), where('studentIds', 'array-contains', me.id)));
    const courses = await Promise.all(cs.docs.map(async (cd) => {
      const course = courseFromDoc(cd.id, cd.data());
      const ss = await getDocs(query(collection(db, 'sessions'), where('courseId', '==', course.id), where('studentIds', 'array-contains', me.id), orderBy('startedAt', 'desc')));
      const sessions = await Promise.all(ss.docs.map(async (sd) => {
        const summary = sessionFromDoc(sd.id, sd.data());
        const a = await getDoc(doc(db, 'sessions', sd.id, 'attendance', me.id)).catch(() => null);
        const att = a?.exists() ? a.data() : null;
        return { ...summary, present: !!att, markedAt: att ? ms(att.markedAt) : null, method: att?.method ?? null };
      }));
      const total = sessions.length;
      const present = sessions.filter((x) => x.present).length;
      return { course: { id: course.id, name: course.name, code: course.code }, total, present, percentage: total ? Math.round((present / total) * 1000) / 10 : null, sessions };
    }));
    courses.sort((a, b) => a.course.name.localeCompare(b.course.name));
    const total = courses.reduce((n, c) => n + c.total, 0);
    const present = courses.reduce((n, c) => n + c.present, 0);
    return { courses, overall: { total, present, percentage: total ? Math.round((present / total) * 1000) / 10 : null } };
  },

  async courseReport(courseId: string) {
    const me = (await this.me()).user;
    const c = await getDoc(doc(db, 'courses', courseId));
    if (!c.exists()) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course not found');
    const course = courseFromDoc(c.id, c.data());
    const ss = await getDocs(query(collection(db, 'sessions'), where('courseId', '==', courseId), where('organiserId', '==', me.id), orderBy('startedAt', 'desc')));
    const sessions = ss.docs.map((d) => sessionFromDoc(d.id, d.data()));
    const counts = new Map<string, number>();
    await Promise.all(ss.docs.map(async (sd) => {
      const att = await getDocs(collection(db, 'sessions', sd.id, 'attendance'));
      att.docs.forEach((a) => counts.set(a.id, (counts.get(a.id) ?? 0) + 1));
    }));
    const students = Object.entries(course.roster).map(([uid, r]) => {
      const present = counts.get(uid) ?? 0;
      return {
        student: { id: uid, name: r.name, email: r.email, role: 'student' as Role, studentCode: r.studentCode, deviceId: null, deviceName: r.deviceName, createdAt: 0 },
        present, total: sessions.length, percentage: sessions.length ? Math.round((present / sessions.length) * 1000) / 10 : null,
      };
    }).sort((a, b) => a.student.name.localeCompare(b.student.name));
    return { course: { id: course.id, name: course.name }, sessions, students };
  },

  // ---- device approvals ----
  async deviceRequests(status = 'pending') {
    const s = await getDocs(query(collection(db, 'deviceRequests'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(50)));
    return { requests: s.docs.map((d) => requestFromDoc(d.id, d.data())) };
  },

  async resolveDeviceRequest(id: string, action: 'approve' | 'reject') {
    const me = (await this.me()).user;
    const r = await getDoc(doc(db, 'deviceRequests', id));
    if (!r.exists() || r.data().status !== 'pending') throw new ApiError(404, 'REQUEST_NOT_FOUND', 'No pending request with that id');
    const d = r.data();
    const batch = writeBatch(db);
    if (action === 'approve') batch.update(doc(db, 'users', d.userId), { deviceId: d.newDeviceId, deviceName: d.newDeviceName ?? null });
    batch.update(doc(db, 'deviceRequests', id), { status: action === 'approve' ? 'approved' : 'rejected', resolvedAt: now(), resolvedBy: me.id });
    await batch.commit();
    return { ok: true };
  },
};

export type Api = typeof api;
