import React, { useState } from 'react';
import { View, Pressable, Text, Share, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api';
import { useAsync } from '@/hooks';
import { fmtDateTime, fmtDuration, pct } from '@/format';
import { Screen, Card, H2, P, Caption, Button, Banner, Row, Avatar, Empty, Loading, Pill, Input, Progress, Stat, Segmented } from '@/components/ui';
import { Press, PulseDot } from '@/motion';
import { hasNativeAdvertiser } from '@/ble';
import { useTheme, space, radius } from '@/theme';

const DURATIONS = [3, 5, 10, 15, 30];
const RANGES = [
  { label: 'Close', hint: '~3 m', rssi: -65 },
  { label: 'Room', hint: '~10 m', rssi: -75 },
  { label: 'Hall', hint: '~20 m', rssi: -85 },
];

function Chip({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press onPress={onPress} scaleTo={0.92} style={{
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5,
      borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primaryBg : t.surface, alignItems: 'center',
    }}>
      <Text style={{ color: on ? t.primary : t.text, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      {sub && <Text style={{ color: t.textFaint, fontSize: 11 }}>{sub}</Text>}
    </Press>
  );
}

export default function CourseDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = useAsync(() => api.course(id!), [id]);
  const report = useAsync(() => api.courseReport(id!), [id]);
  const [duration, setDuration] = useState(5);
  const [range, setRange] = useState(1);
  const [demo, setDemo] = useState(!hasNativeAdvertiser);
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [tab, setTab] = useState<'sessions' | 'roster' | 'report'>('sessions');

  const active = course.data?.sessions.find((s) => s.active);

  const start = async () => {
    setStarting(true); setError(null);
    try {
      const res = await api.startSession({ courseId: id!, title: title.trim() || undefined, durationSec: duration * 60, rssiThreshold: RANGES[range].rssi, demo });
      router.push({ pathname: '/(organiser)/session/[id]', params: { id: res.session.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the session');
    } finally { setStarting(false); }
  };

  const addStudent = async () => {
    if (!email.trim()) return;
    setAddingStudent(true); setError(null);
    try { await api.enroll(id!, email.trim()); setEmail(''); course.refresh(); report.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add student'); }
    finally { setAddingStudent(false); }
  };

  const removeStudent = (userId: string, name: string) => {
    const go = async () => { await api.unenroll(id!, userId); course.refresh(); report.refresh(); };
    if (Platform.OS === 'web') { if (confirm(`Remove ${name} from this course?`)) go(); return; }
    Alert.alert('Remove student', `Remove ${name} from this course?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const shareCode = () => {
    const c = course.data?.course;
    if (!c) return;
    const msg = `Join "${c.name}" on ProxyProof with code ${c.code}`;
    if (Platform.OS === 'web') { navigator.clipboard?.writeText(c.code); return; }
    Share.share({ message: msg });
  };

  if (course.loading && !course.data) return <Screen><Loading /></Screen>;
  if (!course.data) return <Screen><Banner message={course.error ?? 'Course not found'} /><Button title="Back" variant="secondary" onPress={() => router.back()} /></Screen>;
  const { course: c, roster = [], sessions } = course.data;

  return (
    <Screen refreshing={course.refreshing} onRefresh={() => { course.refresh(); report.refresh(); }}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
        <Row gap={4}><Ionicons name="chevron-back" size={18} color={t.primary} /><Caption color={t.primary}>Courses</Caption></Row>
      </Pressable>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <H2>{c.name}</H2>
          <Caption style={{ marginTop: 2 }}>{c.studentCount} students · {c.sessionCount} sessions</Caption>
        </View>
        <Pressable onPress={shareCode} style={{ alignItems: 'center', backgroundColor: t.primaryBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md }}>
          <Caption color={t.primary} style={{ fontSize: 10, letterSpacing: 1 }}>JOIN CODE</Caption>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 20, letterSpacing: 2 }}>{c.code}</Text>
        </Pressable>
      </Row>

      <Banner message={error} onDismiss={() => setError(null)} />

      {active ? (
        <Card tone="success" onPress={() => router.push({ pathname: '/(organiser)/session/[id]', params: { id: active.id } })} style={{ marginTop: space.lg }} enter={0}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10}>
              <PulseDot color={t.success} size={10} />
              <View>
                <P strong>Session live</P>
                <Caption>{active.presentCount}/{active.enrolledCount} marked · open dashboard</Caption>
              </View>
            </Row>
            <Ionicons name="chevron-forward" size={18} color={t.success} />
          </Row>
        </Card>
      ) : (
        <Card style={{ marginTop: space.lg }} enter={0}>
          <Row gap={8} style={{ marginBottom: 12 }}>
            <Ionicons name="radio-outline" size={20} color={t.primary} />
            <P strong style={{ fontSize: 17 }}>Start a session</P>
          </Row>
          <Caption style={{ marginBottom: 8 }}>Duration</Caption>
          <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
            {DURATIONS.map((d) => <Chip key={d} label={`${d} min`} on={duration === d} onPress={() => setDuration(d)} />)}
          </Row>
          <Caption style={{ marginBottom: 8 }}>Required proximity</Caption>
          <Row gap={8} style={{ marginBottom: 14 }}>
            {RANGES.map((r, i) => <Chip key={r.label} label={r.label} sub={r.hint} on={range === i} onPress={() => setRange(i)} />)}
          </Row>
          <Input label="Title (optional)" icon="text-outline" value={title} onChangeText={setTitle} placeholder="Lecture 12 · Consensus" />
          <Press onPress={() => setDemo((d) => !d)} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: demo ? t.warningBg : t.surfaceAlt, marginBottom: space.lg }}>
            <Ionicons name={demo ? 'checkbox' : 'square-outline'} size={20} color={demo ? t.warning : t.textMuted} />
            <View style={{ flex: 1 }}>
              <P strong style={{ fontSize: 14 }}>Demo mode (no Bluetooth)</P>
              <Caption>Also publishes the rotating token online so phones without BLE can be marked. Turn off for real classes.</Caption>
            </View>
          </Press>
          <Button title={`Broadcast for ${fmtDuration(duration * 60)}`} onPress={start} loading={starting} size="lg" icon={<Ionicons name="bluetooth" size={18} color={t.primaryText} />} />
        </Card>
      )}

      <View style={{ marginTop: space.lg }}>
        <Segmented options={[{ key: 'sessions', label: 'Sessions' }, { key: 'roster', label: 'Roster' }, { key: 'report', label: 'Report' }]} value={tab} onChange={setTab} />
      </View>

      {tab === 'sessions' && (
        <View style={{ marginTop: space.md }}>
          {!sessions.length ? <Empty icon={<Ionicons name="time-outline" size={32} color={t.textFaint} />} title="No sessions yet" body="Start one above when class begins." />
            : sessions.map((s, i) => (
              <Card key={s.id} onPress={() => router.push({ pathname: '/(organiser)/session/[id]', params: { id: s.id } })} style={{ paddingVertical: 14 }} enter={i}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <P strong>{s.title || fmtDateTime(s.startedAt)}</P>
                    <Caption>{s.title ? fmtDateTime(s.startedAt) + ' · ' : ''}{fmtDuration(s.durationSec)}</Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: 18 }}>{s.presentCount}<Text style={{ color: t.textFaint, fontSize: 13 }}>/{s.enrolledCount}</Text></Text>
                    {s.active ? <Pill label="LIVE" tone="success" /> : <Caption color={t.textFaint}>present</Caption>}
                  </View>
                </Row>
              </Card>
            ))}
        </View>
      )}

      {tab === 'roster' && (
        <View style={{ marginTop: space.md }}>
          <Card>
            <Caption style={{ marginBottom: 8 }}>Students join with the code above, or add one by email:</Caption>
            <Row>
              <View style={{ flex: 1 }}><Input icon="mail-outline" value={email} onChangeText={setEmail} placeholder="name@vitstudent.ac.in" autoCapitalize="none" keyboardType="email-address" /></View>
              <Button title="Add" size="md" onPress={addStudent} loading={addingStudent} style={{ marginBottom: 16 }} />
            </Row>
          </Card>
          {!roster.length ? <Empty title="No students enrolled" body="Share the join code." /> : roster.map((u, i) => (
            <Card key={u.id} style={{ paddingVertical: 12 }} enter={i}>
              <Row>
                <Avatar name={u.name} size={38} />
                <View style={{ flex: 1 }}>
                  <P strong>{u.name}</P>
                  <Caption>{u.studentCode ? `${u.studentCode} · ` : ''}{u.deviceName ?? 'no device'}</Caption>
                </View>
                <Pressable onPress={() => removeStudent(u.id, u.name)} hitSlop={10}><Ionicons name="person-remove-outline" size={18} color={t.textFaint} /></Pressable>
              </Row>
            </Card>
          ))}
        </View>
      )}

      {tab === 'report' && (
        <View style={{ marginTop: space.md }}>
          {report.loading ? <Loading /> : !report.data ? <Banner message={report.error} /> : (
            <>
              <Row style={{ marginBottom: space.md }}>
                <Stat label="Sessions" value={report.data.sessions.length} enter={0} />
                <Stat label="Students" value={report.data.students.length} enter={1} />
                <Stat label="Avg attendance" value={pct(avg(report.data.students.map((s) => s.percentage)))} tone="primary" enter={2} />
              </Row>
              {report.data.students.sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0)).map(({ student, present, total, percentage }, i) => (
                <Card key={student.id} style={{ paddingVertical: 12 }} enter={i + 3}>
                  <Row style={{ marginBottom: 8 }}>
                    <Avatar name={student.name} size={34} />
                    <View style={{ flex: 1 }}><P strong>{student.name}</P><Caption>{present}/{total} sessions</Caption></View>
                    <Text style={{ color: tone(percentage, t), fontWeight: '800', fontSize: 18 }}>{pct(percentage)}</Text>
                  </Row>
                  <Progress value={percentage ?? 0} tone={percentage === null ? 'primary' : percentage >= 75 ? 'success' : percentage >= 50 ? 'warning' : 'danger'} />
                </Card>
              ))}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
function tone(p: number | null, t: ReturnType<typeof useTheme>) {
  return p === null ? t.textMuted : p >= 75 ? t.success : p >= 50 ? t.warning : t.danger;
}
