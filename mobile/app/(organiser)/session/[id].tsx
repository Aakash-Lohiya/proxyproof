import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Text, Share, Platform, Alert, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { updateDoc, doc } from 'firebase/firestore';
import { api, Attendance, User } from '@/api';
import { db } from '@/firebase/app';
import { useSessionLive } from '@/firebase/live';
import { startVerifier } from '@/firebase/verify';
import { useAsync, useTick } from '@/hooks';
import { createAdvertiser, Advertiser } from '@/ble';
import { tokenFor, windowFor } from '@/token';
import { fmtCountdown, fmtTime, fmtDateTime } from '@/format';
import { Screen, Card, H2, P, Caption, Button, Banner, Row, Avatar, Empty, Loading, Pill, SectionTitle, Stat } from '@/components/ui';
import { PulseDot, Swap, Press, EnterUp, ExitLeft, Layout, haptic } from '@/motion';
import { useTheme, space } from '@/theme';

export default function SessionDashboard() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useAsync(() => api.session(id!), [id]);
  const live = useSessionLive(id, true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string>('········');
  const [rotProgress, setRotProgress] = useState(0);
  const [decisions, setDecisions] = useState(0);
  const advertiser = useRef<Advertiser | null>(null);
  const attendanceRef = useRef<Attendance[]>([]);

  const session = live.session ?? detail.data?.session ?? null;
  const roster = detail.data?.course.roster ?? {};
  const secret = detail.data?.secret;
  const closed = !!session && !session.active;
  const attendance = live.attendance.length || !detail.data ? live.attendance : detail.data.attendance ?? [];
  attendanceRef.current = attendance;
  const attempts = live.attempts.length || !detail.data ? live.attempts : detail.data.attempts ?? [];
  useTick(1000, !closed);

  // Broadcast loop: rotate the token on air; in demo mode also publish it to Firestore.
  useEffect(() => {
    if (!session || closed || !secret) return;
    const adv = createAdvertiser();
    advertiser.current = adv;
    let lastWindow = -1;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const now = Date.now();
      const w = windowFor(now, session.rotationMs);
      setRotProgress((now - w * session.rotationMs) / session.rotationMs);
      if (w !== lastWindow) {
        const first = lastWindow === -1;
        lastWindow = w;
        const tok = tokenFor(secret, session.shortId, w);
        setToken(tok);
        const beacon = { shortId: session.shortId, token: tok };
        try {
          if (first) await adv.start(beacon); else await adv.update(beacon);
        } catch (e) {
          setError(`Bluetooth broadcast failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (session.demo) {
          updateDoc(doc(db, 'sessions', session.shortId), { demoToken: tok, demoTokenAt: now }).catch(() => {});
        }
      }
    };
    const iv = setInterval(tick, 200);
    tick();
    return () => { stopped = true; clearInterval(iv); adv.stop().catch(() => {}); advertiser.current = null; };
  }, [session?.shortId, session?.rotationMs, session?.demo, closed, secret]);

  // Verifier: this phone decides on pending mark requests.
  useEffect(() => {
    if (!session || closed || !secret) return;
    const stop = startVerifier({
      shortId: session.shortId, secret, rotationMs: session.rotationMs, rssiThreshold: session.rssiThreshold, roster,
      getAttendance: () => new Map(attendanceRef.current.map((a) => [a.userId, a.deviceId])),
      onDecision: (d) => { setDecisions((n) => n + 1); if (d.accepted) haptic.success(); },
      onError: (m) => setError(m),
    });
    return stop;
  }, [session?.shortId, session?.rotationMs, session?.rssiThreshold, closed, secret, roster]);

  // Close when the countdown hits zero.
  useEffect(() => {
    if (!session || closed) return;
    const ms = session.endsAt - Date.now();
    const to = setTimeout(() => api.closeSession(session.shortId).catch(() => {}), Math.max(0, ms));
    return () => clearTimeout(to);
  }, [session?.shortId, session?.endsAt, closed]);

  const closeNow = () => {
    const go = async () => {
      setBusy('close');
      try { await api.closeSession(id!); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
    };
    if (Platform.OS === 'web') { if (confirm('Close this session now? Students can no longer be auto-marked.')) go(); return; }
    Alert.alert('Close session', 'Students can no longer be auto-marked.', [{ text: 'Keep open', style: 'cancel' }, { text: 'Close', style: 'destructive', onPress: go }]);
  };

  const manualMark = async (u: User) => {
    setBusy(u.id);
    try { await api.manualMark(id!, u.id); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  const remove = async (a: Attendance) => {
    setBusy(a.userId);
    try { await api.removeMark(id!, a.userId); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  const exportCsv = async () => {
    setBusy('export');
    try {
      const csv = await api.exportCsv(id!);
      const name = `${detail.data?.course.name ?? 'attendance'}-${new Date(session!.startedAt).toISOString().slice(0, 10)}.csv`.replace(/[^\w.-]+/g, '_');
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: name, message: csv });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(null); }
  };

  const remaining = session ? session.endsAt - Date.now() : 0;
  const total = session ? session.durationSec * 1000 : 1;
  const pctElapsed = Math.min(1, Math.max(0, 1 - remaining / total));
  const sortedAttendance = useMemo(() => [...attendance].sort((a, b) => b.markedAt - a.markedAt), [attendance]);
  const present = useMemo(() => new Set(attendance.map((a) => a.userId)), [attendance]);
  const absent: User[] = useMemo(() => Object.entries(roster).filter(([uid]) => !present.has(uid))
    .map(([uid, r]) => ({ id: uid, name: r.name, email: r.email, role: 'student' as const, studentCode: r.studentCode, deviceId: null, deviceName: r.deviceName, createdAt: 0 }))
    .sort((a, b) => a.name.localeCompare(b.name)), [roster, present]);

  if (detail.loading && !detail.data) return <Screen><Loading /></Screen>;
  if (!detail.data || !session) return <Screen><Banner message={detail.error ?? 'Session not found'} /><Button title="Back" variant="secondary" onPress={() => router.back()} /></Screen>;

  const transport = advertiser.current?.transport ?? 'native';
  const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

  return (
    <Screen refreshing={detail.refreshing} onRefresh={detail.refresh}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <Pressable onPress={() => router.back()}><Row gap={4}><Ionicons name="chevron-back" size={18} color={t.primary} /><Caption color={t.primary}>{detail.data.course.name}</Caption></Row></Pressable>
        <Row gap={8}>
          <PulseDot color={live.connected ? t.success : t.textFaint} size={8} active={live.connected && !closed} />
          <Caption color={live.connected ? t.success : t.textFaint}>{live.connected ? 'Live' : 'Connecting'}</Caption>
        </Row>
      </Row>
      <H2>{session.title || 'Attendance session'}</H2>
      <Caption style={{ marginTop: 2 }}>{fmtDateTime(session.startedAt)}</Caption>

      <Banner message={error} onDismiss={() => setError(null)} />

      <Card tone={closed ? undefined : 'primary'} style={{ marginTop: space.lg }} enter={0}>
        {closed ? (
          <Row gap={10}>
            <Ionicons name="lock-closed" size={20} color={t.textMuted} />
            <View style={{ flex: 1 }}>
              <P strong>Session closed</P>
              <Caption>Ended {fmtTime(session.closedAt ?? session.endsAt)}. You can still adjust marks and export.</Caption>
            </View>
          </Row>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={8}>
                <Ionicons name="bluetooth" size={18} color={t.primary} />
                <P strong style={{ color: t.primary }}>Broadcasting</P>
                {transport === 'simulated' && <Pill label="SIMULATED" tone="warning" />}
                {session.demo && <Pill label="DEMO" tone="warning" icon="flask-outline" />}
              </Row>
              <Text style={{ color: t.text, fontVariant: ['tabular-nums'], fontWeight: '800', fontSize: 28, letterSpacing: -1 }}>{fmtCountdown(remaining)}</Text>
            </Row>
            <View style={[styles.track, { backgroundColor: t.surfaceAlt, marginTop: 10 }]}>
              <View style={[styles.fill, { width: `${pctElapsed * 100}%`, backgroundColor: t.primary }]} />
            </View>
            <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <View>
                <Caption color={t.textFaint} style={{ fontSize: 10, letterSpacing: 1 }}>ROTATING TOKEN</Caption>
                <Swap k={token}>
                  <Text style={{ color: t.text, fontFamily: mono, fontSize: 22, letterSpacing: 3, fontWeight: '700' }}>{token.toUpperCase()}</Text>
                </Swap>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Caption color={t.textFaint} style={{ fontSize: 10, letterSpacing: 1 }}>SESSION</Caption>
                <Text style={{ color: t.textMuted, fontFamily: mono, fontSize: 14 }}>{session.shortId.toUpperCase()}</Text>
              </View>
            </Row>
            <View style={[styles.track, { backgroundColor: t.surfaceAlt, marginTop: 8, height: 3 }]}>
              <View style={[styles.fill, { width: `${(1 - rotProgress) * 100}%`, backgroundColor: t.accent, height: 3 }]} />
            </View>
            <Caption color={t.textFaint} style={{ marginTop: 6 }}>
              Rotates every {session.rotationMs / 1000}s · students need RSSI ≥ {session.rssiThreshold} dBm · this phone verifies requests ({decisions} decided)
              {session.demo ? ' · demo mode: the token is also published to Firestore so phones without Bluetooth can be marked' : ''}
            </Caption>
          </>
        )}
      </Card>

      <Row style={{ marginBottom: space.md }}>
        <Stat label="Present" value={attendance.length} tone="success" enter={1} />
        <Stat label="Absent" value={absent.length} tone={absent.length ? 'danger' : undefined} enter={2} />
        <Stat label="Rejected" value={attempts.length} tone={attempts.length ? 'warning' : undefined} enter={3} />
      </Row>

      <Row style={{ marginBottom: space.sm }}>
        {!closed && <Button title="Close session" variant="danger" size="sm" style={{ flex: 1 }} onPress={closeNow} loading={busy === 'close'} icon={<Ionicons name="stop-circle-outline" size={16} color={t.danger} />} />}
        <Button title="Export CSV" variant="secondary" size="sm" style={{ flex: 1 }} onPress={exportCsv} loading={busy === 'export'} icon={<Ionicons name="download-outline" size={16} color={t.text} />} />
      </Row>

      <SectionTitle>Present · {attendance.length}</SectionTitle>
      {!sortedAttendance.length ? (
        <Empty icon={<Ionicons name="radio-outline" size={30} color={t.textFaint} />} title={closed ? 'Nobody was marked' : 'Waiting for students…'} body={closed ? undefined : 'Phones in range are marked automatically. They appear here the moment this phone verifies them.'} />
      ) : sortedAttendance.map((a, i) => (
        <Animated.View key={a.id} entering={EnterUp.delay(Math.min(i, 8) * 50)} exiting={ExitLeft} layout={Layout}>
          <Card style={{ paddingVertical: 12 }}>
            <Row>
              <Avatar name={a.student.name} size={38} tone="success" />
              <View style={{ flex: 1 }}>
                <P strong>{a.student.name}</P>
                <Caption numberOfLines={1}>
                  {a.student.studentCode ?? a.student.email} · {fmtTime(a.markedAt)}{a.method === 'auto' && a.rssi !== null ? ` · ${a.rssi} dBm` : ''}
                </Caption>
              </View>
              <Pill label={a.method === 'auto' ? 'BLE' : 'MANUAL'} tone={a.method === 'auto' ? 'success' : 'neutral'} icon={a.method === 'auto' ? 'bluetooth' : 'hand-left-outline'} />
              <Press onPress={() => remove(a)} hitSlop={10} disabled={busy === a.userId} style={{ marginLeft: 8 }} scaleTo={0.85}>
                <Ionicons name="close-circle-outline" size={22} color={t.textFaint} />
              </Press>
            </Row>
          </Card>
        </Animated.View>
      ))}

      <SectionTitle>Absent · {absent.length}</SectionTitle>
      {!absent.length ? <Caption style={{ marginBottom: space.md }}>Everyone enrolled is marked.</Caption> : absent.map((u, i) => (
        <Animated.View key={u.id} entering={EnterUp.delay(Math.min(i, 8) * 50)} exiting={ExitLeft} layout={Layout}>
          <Card style={{ paddingVertical: 12 }}>
            <Row>
              <Avatar name={u.name} size={38} />
              <View style={{ flex: 1 }}>
                <P strong>{u.name}</P>
                <Caption>{u.studentCode ?? u.email}</Caption>
              </View>
              <Button title="Mark" size="sm" variant="secondary" onPress={() => manualMark(u)} loading={busy === u.id} />
            </Row>
          </Card>
        </Animated.View>
      ))}

      {!!attempts.length && (
        <>
          <SectionTitle>Rejected attempts · {attempts.length}</SectionTitle>
          <Caption style={{ marginBottom: space.sm }}>Proxy signals. Each entry failed at least one anti-proxy check.</Caption>
          {attempts.slice(0, 20).map((a) => (
            <Card key={a.id} tone="warning" style={{ paddingVertical: 10 }} enter={0}>
              <Row>
                <Ionicons name={iconFor(a.reason)} size={18} color={t.warning} />
                <View style={{ flex: 1 }}>
                  <P strong style={{ fontSize: 14 }}>{a.student?.name ?? 'Unknown'} <Caption color={t.textFaint}>{fmtTime(a.at)}</Caption></P>
                  <Caption color={t.warning}>{a.message}{a.rssi !== null ? ` (${a.rssi} dBm)` : ''}</Caption>
                </View>
              </Row>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function iconFor(reason: string): any {
  return ({
    TOKEN_STALE: 'time-outline', DEVICE_MISMATCH: 'phone-portrait-outline', DEVICE_ALREADY_USED: 'people-outline',
    TOO_FAR: 'cellular-outline', NOT_ENROLLED: 'person-remove-outline', SESSION_ENDED: 'lock-closed-outline',
  } as Record<string, string>)[reason] ?? 'alert-circle-outline';
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
