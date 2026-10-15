// Organiser-side verifier. The organiser's phone holds the session secret and is the
// only party that can compute the rotating token, so it is the natural verifier:
// it watches pending mark requests and either writes attendance or rejects them.
import { collection, doc, onSnapshot, query, where, writeBatch, increment } from 'firebase/firestore';
import { db } from './app';
import { RosterEntry } from './data';
import { tokenFor, windowFor } from '../token';

export type VerifierOptions = {
  shortId: string;
  secret: string;
  rotationMs: number;
  rssiThreshold: number;
  roster: Record<string, RosterEntry>;
  /** Current attendance (userId -> deviceId) so one device can't mark two students. */
  getAttendance: () => Map<string, string | null>;
  onDecision?: (d: { userId: string; accepted: boolean; reason?: string }) => void;
  onError?: (msg: string) => void;
};

export function startVerifier(o: VerifierOptions) {
  const inflight = new Set<string>();
  let stopped = false;

  const tokenOk = (token: string) => {
    const w = windowFor(Date.now(), o.rotationMs);
    return [-1, 0, 1].some((k) => tokenFor(o.secret, o.shortId, w + k) === token);
  };

  async function handle(userId: string, r: any) {
    if (stopped || inflight.has(userId)) return;
    inflight.add(userId);
    try {
      const attendance = o.getAttendance();
      const reqRef = doc(db, 'sessions', o.shortId, 'requests', userId);
      const batch = writeBatch(db);
      const reject = (reason: string) => {
        batch.update(reqRef, { status: 'rejected', reason, resolvedAt: Date.now() });
        batch.set(doc(collection(db, 'sessions', o.shortId, 'attempts')), {
          userId, name: o.roster[userId]?.name ?? 'Unknown', studentCode: o.roster[userId]?.studentCode ?? null,
          deviceId: r.deviceId ?? null, reason, rssi: r.rssi ?? null, at: Date.now(),
        });
        o.onDecision?.({ userId, accepted: false, reason });
      };

      const entry = o.roster[userId];
      if (!entry) reject('NOT_ENROLLED');
      else if (attendance.has(userId)) {
        batch.update(reqRef, { status: 'accepted', reason: null, resolvedAt: Date.now() });
      } else if (typeof r.token !== 'string' || !tokenOk(r.token.toLowerCase())) reject('TOKEN_STALE');
      else if (typeof r.rssi !== 'number' || r.rssi < o.rssiThreshold) reject('TOO_FAR');
      else if ([...attendance.entries()].some(([uid, dev]) => dev && dev === r.deviceId && uid !== userId)) reject('DEVICE_ALREADY_USED');
      else {
        batch.set(doc(db, 'sessions', o.shortId, 'attendance', userId), {
          userId, name: entry.name, email: entry.email, studentCode: entry.studentCode, deviceId: r.deviceId,
          markedAt: Date.now(), method: 'auto', rssi: r.rssi,
        });
        batch.update(reqRef, { status: 'accepted', reason: null, resolvedAt: Date.now() });
        batch.update(doc(db, 'sessions', o.shortId), { presentCount: increment(1) });
        o.onDecision?.({ userId, accepted: true });
      }
      await batch.commit();
    } catch (e) {
      o.onError?.(`Could not resolve a mark request: ${(e as Error)?.message ?? e}`);
    } finally {
      inflight.delete(userId);
    }
  }

  const unsub = onSnapshot(
    query(collection(db, 'sessions', o.shortId, 'requests'), where('status', '==', 'pending')),
    (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'added' || ch.type === 'modified') handle(ch.doc.id, ch.doc.data());
      }
    },
    (err) => o.onError?.(`Request listener failed: ${err.message}`),
  );

  return () => { stopped = true; unsub(); };
}
