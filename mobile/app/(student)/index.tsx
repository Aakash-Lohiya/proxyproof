import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Text, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, Attendance } from '@/api';
import { useAuth } from '@/auth';
import { useAsync } from '@/hooks';
import { createScanner, Scanner, Sighting, hasNativeScanner } from '@/ble';
import { Radar } from '@/components/Radar';
import { LogoMark } from '@/components/Logo';
import { Screen, Card, H1, P, Caption, Button, Input, Banner, Pill, Row, Empty, SectionTitle, Avatar } from '@/components/ui';
import { useTheme, space, radius } from '@/theme';
import { fmtTime, firstName } from '@/format';
import { Enter, Pop, Swap, Press, haptic } from '@/motion';
import { useMyMark } from '@/firebase/live';

type Status =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'found'; shortId: string; rssi: number }
  | { kind: 'marked'; attendance: Attendance; course?: string }
  | { kind: 'error'; message: string; code?: string };

const HINTS: Record<string, string> = {
  TOO_FAR: 'Signal is weak. Move closer to the organiser and stay still.',
  TOKEN_STALE: 'Token expired in transit, retrying with a fresh one…',
  DEVICE_MISMATCH: 'This is not the phone bound to your account.',
  DEVICE_ALREADY_USED: 'This phone already marked someone else in this session.',
  NOT_ENROLLED: 'You are not enrolled in the course running this session.',
  SESSION_ENDED: 'That session has already ended.',
  SESSION_NOT_FOUND: 'Beacon belongs to an unknown session.',
};

export default function StudentHome() {
  const t = useTheme();
  const { user, device } = useAuth();
  const courses = useAsync(() => api.courses());
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pendingShortId, setPendingShortId] = useState<string | null>(null);
  const outcome = useMyMark(pendingShortId);
  const sessionInfo = useRef<Map<string, { courseName: string; title: string | null }>>(new Map());
  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [recent, setRecent] = useState<(Attendance & { courseName: string; title: string | null })[]>([]);
  const [lastSeen, setLastSeen] = useState<Sighting | null>(null);
  const scanner = useRef<Scanner | null>(null);
  const inflight = useRef(false);
  const settled = useRef<Map<string, 'marked' | 'blocked'>>(new Map());
  const lastFail = useRef(0);

  const onSighting = useCallback(async (s: Sighting) => {
    setLastSeen(s);
    const state = settled.current.get(s.shortId);
    if (state === 'marked' || state === 'blocked') return;
    if (inflight.current) return;
    if (Date.now() - lastFail.current < 2500) return;
    inflight.current = true;
    setStatus({ kind: 'found', shortId: s.shortId, rssi: s.rssi });
    try {
      // Ask the organiser's phone to verify; the answer arrives through the Firestore listener below.
      const res = await api.requestMark({ shortId: s.shortId, token: s.token, rssi: s.rssi }, device?.id ?? '');
      sessionInfo.current.set(s.shortId, { courseName: res.session.courseName, title: res.session.title });
      setPendingShortId(s.shortId);
      lastFail.current = Date.now(); // throttle re-requests while the organiser decides
    } catch (e) {
      lastFail.current = Date.now();
      const code = e instanceof ApiError ? e.code : undefined;
      if (code && ['DEVICE_MISMATCH', 'DEVICE_ALREADY_USED', 'NOT_ENROLLED', 'SESSION_ENDED', 'SESSION_NOT_FOUND'].includes(code)) {
        settled.current.set(s.shortId, 'blocked');
      }
      setStatus({ kind: 'error', message: (code && HINTS[code]) || (e instanceof Error ? e.message : 'Could not mark attendance'), code });
    } finally {
      inflight.current = false;
    }
  }, [device?.id]);

  // Organiser's verdict for the pending request. Each verdict is handled once per session,
  // otherwise every Firestore snapshot would replay the haptic and the status change.
  const handled = useRef<string>('');
  useEffect(() => {
    if (!pendingShortId) return;
    const key = `${pendingShortId}:${outcome.kind}:${outcome.kind === 'rejected' ? outcome.reason : ''}`;
    if (handled.current === key) return;
    handled.current = key;
    const info = sessionInfo.current.get(pendingShortId);
    if (outcome.kind === 'marked') {
      settled.current.set(pendingShortId, 'marked');
      haptic.success();
      setStatus({ kind: 'marked', attendance: outcome.attendance, course: info?.courseName });
      const entry = { ...outcome.attendance, courseName: info?.courseName ?? 'Session', title: info?.title ?? null };
      setRecent((xs) => [entry, ...xs.filter((x) => x.sessionId !== outcome.attendance.sessionId)]);
    } else if (outcome.kind === 'rejected') {
      lastFail.current = Date.now();
      if (['DEVICE_MISMATCH', 'DEVICE_ALREADY_USED', 'NOT_ENROLLED'].includes(outcome.reason)) settled.current.set(pendingShortId, 'blocked');
      haptic.error();
      setStatus({ kind: 'error', message: HINTS[outcome.reason] ?? `Rejected: ${outcome.reason}`, code: outcome.reason });
    }
  }, [outcome, pendingShortId]);

  const stop = useCallback(async () => {
    await scanner.current?.stop().catch(() => {});
    scanner.current = null;
  }, []);

  const start = useCallback(async () => {
    await stop();
    const sc = createScanner();
    scanner.current = sc;
    setStatus((s) => (s.kind === 'marked' ? s : { kind: 'scanning' }));
    await sc.start(onSighting, (msg) => setStatus((s) => (s.kind === 'marked' ? s : { kind: 'error', message: msg })));
  }, [onSighting, stop]);

  useEffect(() => {
    if (scanning) start(); else { stop(); setStatus({ kind: 'idle' }); }
    return () => { stop(); };
  }, [scanning, start, stop]);

  // Pause scanning in the background on native to save battery; resume on foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (!scanning) return;
      if (st === 'active') start(); else if (hasNativeScanner) stop();
    });
    return () => sub.remove();
  }, [scanning, start, stop]);

  // Clear "marked" state once a sighting for a *different* session shows up, or after a stale sighting window.
  useEffect(() => {
    if (status.kind !== 'error' || status.code === 'DEVICE_MISMATCH') return;
    const to = setTimeout(() => setStatus((s) => (s.kind === 'error' && scanning ? { kind: 'scanning' } : s)), 6000);
    return () => clearTimeout(to);
  }, [status, scanning]);

  const join = async () => {
    if (!code.trim()) return;
    setJoining(true); setJoinError(null);
    try { await api.joinCourse(code.trim()); setCode(''); courses.refresh(); }
    catch (e) { setJoinError(e instanceof Error ? e.message : 'Could not join'); }
    finally { setJoining(false); }
  };

  const mode = status.kind === 'found' ? 'found' : status.kind;
  const headline = {
    idle: 'Auto-detect is off',
    scanning: 'Listening for your class',
    found: 'Session found, verifying…',
    marked: "You're marked present",
    error: 'Not marked yet',
  }[mode];
  const sub = status.kind === 'scanning'
    ? 'Keep Bluetooth on. You will be marked automatically when the organiser starts a session nearby.'
    : status.kind === 'found' ? `Beacon ${status.shortId.toUpperCase()} at ${status.rssi} dBm. Waiting for the organiser's phone to verify token, device and distance…`
    : status.kind === 'marked' ? `Recorded at ${fmtTime(status.attendance.markedAt)}${status.attendance.rssi !== null ? ` · ${status.attendance.rssi} dBm` : ''}. Still listening for the next session.`
    : status.kind === 'error' ? status.message
    : 'Turn auto-detect on to be marked when a session starts.';

  return (
    <Screen refreshing={courses.refreshing} onRefresh={courses.refresh}>
      <Enter index={0}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <View>
            <Caption>Hi {firstName(user?.name)},</Caption>
            <H1 style={{ fontSize: 24 }}>Attendance</H1>
          </View>
          <LogoMark size={44} glow={false} />
        </Row>
      </Enter>

      <Enter index={1}>
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Radar mode={mode} />
          <Swap k={headline}>
            <P strong style={{ fontSize: 20, marginTop: 8, textAlign: 'center' }}>{headline}</P>
          </Swap>
          <Caption style={{ textAlign: 'center', marginTop: 6, paddingHorizontal: 12, lineHeight: 19 }}>{sub}</Caption>
          <Row gap={8} style={{ marginTop: 14 }}>
            {!hasNativeScanner && <Pill label="SIMULATED BLE" tone="warning" icon="flask-outline" />}
            {lastSeen && status.kind !== 'marked' && <Pill label={`LAST BEACON ${lastSeen.rssi} dBm`} tone="neutral" icon="cellular-outline" />}
          </Row>
          <Press onPress={() => setScanning((s) => !s)} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: scanning ? t.primaryBg : t.surfaceAlt, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill }}>
            <Ionicons name={scanning ? 'pause' : 'play'} size={14} color={scanning ? t.primary : t.textMuted} />
            <Text style={{ color: scanning ? t.primary : t.textMuted, fontWeight: '700' }}>{scanning ? 'Auto-detect on' : 'Auto-detect off'}</Text>
          </Press>
        </View>
      </Enter>

      {status.kind === 'marked' && (
        <Pop style={{ marginTop: space.lg }}>
          <Card tone="success">
            <Row>
              <Pop delay={150}><Ionicons name="checkmark-circle" size={30} color={t.success} /></Pop>
              <View style={{ flex: 1 }}>
                <P strong>{status.course ? `${status.course} · ` : 'Present · '}{fmtTime(status.attendance.markedAt)}</P>
                <Caption>Verified from this device with a live token. Nothing else to do.</Caption>
              </View>
            </Row>
          </Card>
        </Pop>
      )}

      {!!recent.length && (
        <>
          <SectionTitle>Marked this session</SectionTitle>
          {recent.map((a, i) => (
            <Card key={a.id} style={{ paddingVertical: 12 }} enter={i}>
              <Row>
                <Avatar name={user?.name ?? '?'} size={36} tone="success" />
                <View style={{ flex: 1 }}><P strong>{a.courseName}</P><Caption>{a.title ? `${a.title} · ` : ''}{fmtTime(a.markedAt)} · {a.method === 'auto' ? 'Bluetooth' : 'manual'}</Caption></View>
                <Pill label="PRESENT" tone="success" />
              </Row>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>My courses</SectionTitle>
      <Card enter={2}>
        <Banner message={joinError} onDismiss={() => setJoinError(null)} />
        <Caption style={{ marginBottom: 8 }}>Enter the 6-letter join code from your organiser.</Caption>
        <Row>
          <View style={{ flex: 1 }}><Input icon="key-outline" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="e.g. K7PX2Q" autoCapitalize="characters" maxLength={6} style={{ letterSpacing: 3, fontWeight: '700' }} /></View>
          <Button title="Join" onPress={join} loading={joining} style={{ marginBottom: 16 }} />
        </Row>
      </Card>
      {!courses.data?.courses.length ? (
        courses.loading ? null : <Empty icon={<Ionicons name="school-outline" size={32} color={t.textFaint} />} title="No courses yet" body="You can only be marked for courses you have joined." />
      ) : courses.data.courses.map((c, i) => (
        <Card key={c.id} style={{ paddingVertical: 12 }} enter={i + 3}>
          <Row>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="book-outline" size={18} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <P strong>{c.name}</P>
              <Caption>{c.organiserName ?? 'Organiser'} · {c.sessionCount} sessions</Caption>
            </View>
            <Pill label={c.code} tone="neutral" />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
