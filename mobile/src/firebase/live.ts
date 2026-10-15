// Real-time listeners (replace the old Socket.IO room).
import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db, auth } from './app';
import { Attendance, Attempt, SessionSummary, attendanceFromDoc, attemptFromDoc, sessionFromDoc } from './data';

export type SessionLive = {
  session: SessionSummary | null;
  attendance: Attendance[];
  attempts: Attempt[];
  connected: boolean;
};

/** Organiser dashboard: session doc, attendance and rejected attempts, live. */
export function useSessionLive(shortId: string | undefined, organiser: boolean): SessionLive {
  const [state, setState] = useState<SessionLive>({ session: null, attendance: [], attempts: [], connected: false });
  useEffect(() => {
    if (!shortId) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(doc(db, 'sessions', shortId), (s) => {
      setState((st) => ({ ...st, connected: true, session: s.exists() ? sessionFromDoc(s.id, s.data()) : null }));
    }, () => setState((st) => ({ ...st, connected: false }))));
    if (organiser) {
      unsubs.push(onSnapshot(collection(db, 'sessions', shortId, 'attendance'), (snap) => {
        const attendance = snap.docs.map((d) => attendanceFromDoc(shortId, d.id, d.data())).sort((a, b) => a.markedAt - b.markedAt);
        setState((st) => ({ ...st, attendance }));
      }));
      unsubs.push(onSnapshot(query(collection(db, 'sessions', shortId, 'attempts'), orderBy('at', 'desc'), limit(50)), (snap) => {
        setState((st) => ({ ...st, attempts: snap.docs.map((d) => attemptFromDoc(d.id, d.data())) }));
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, [shortId, organiser]);
  return state;
}

export type MarkOutcome =
  | { kind: 'marked'; attendance: Attendance }
  | { kind: 'rejected'; reason: string }
  | { kind: 'pending' }
  | { kind: 'none' };

/** Student: watches my request + attendance docs for one session. */
export function useMyMark(shortId: string | null): MarkOutcome {
  const [out, setOut] = useState<MarkOutcome>({ kind: 'none' });
  const reqStatus = useRef<{ status: string; reason: string | null }>({ status: 'none', reason: null });
  useEffect(() => {
    setOut({ kind: 'none' });
    const uid = auth.currentUser?.uid;
    if (!shortId || !uid) return;
    let marked: Attendance | null = null;
    // Only publish a new outcome when it actually changes, so consumers don't re-run effects.
    const recompute = () => {
      let next: MarkOutcome;
      if (marked) next = { kind: 'marked', attendance: marked };
      else {
        const r = reqStatus.current;
        if (r.status === 'rejected') next = { kind: 'rejected', reason: r.reason ?? 'REJECTED' };
        else if (r.status === 'pending' || r.status === 'accepted') next = { kind: 'pending' };
        else next = { kind: 'none' };
      }
      setOut((prev) => {
        if (prev.kind !== next.kind) return next;
        if (next.kind === 'rejected' && prev.kind === 'rejected' && prev.reason !== next.reason) return next;
        if (next.kind === 'marked' && prev.kind === 'marked' && prev.attendance.id !== next.attendance.id) return next;
        return prev;
      });
    };
    const u1 = onSnapshot(doc(db, 'sessions', shortId, 'attendance', uid), (s) => {
      marked = s.exists() ? attendanceFromDoc(shortId, s.id, s.data()) : null;
      recompute();
    }, () => {});
    const u2 = onSnapshot(doc(db, 'sessions', shortId, 'requests', uid), (s) => {
      reqStatus.current = s.exists() ? { status: s.data().status, reason: s.data().reason ?? null } : { status: 'none', reason: null };
      recompute();
    }, () => {});
    return () => { u1(); u2(); };
  }, [shortId]);
  return out;
}
