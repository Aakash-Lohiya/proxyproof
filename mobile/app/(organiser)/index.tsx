import React, { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { useAsync, useTick } from '@/hooks';
import { LogoMark } from '@/components/Logo';
import { Screen, Card, H1, P, Caption, Button, Input, Banner, Pill, Row, Empty, Loading, SectionTitle } from '@/components/ui';
import { useTheme, space } from '@/theme';
import { firstName, fmtCountdown, fmtDateTime, fmtDuration } from '@/format';
import { Enter, PulseDot } from '@/motion';

export default function OrganiserHome() {
  const t = useTheme();
  const { user } = useAuth();
  const courses = useAsync(() => api.courses());
  const sessions = useAsync(() => api.mySessions());
  const pending = useAsync(() => api.deviceRequests('pending'));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = (sessions.data?.sessions ?? []).filter((s) => s.active);
  useTick(1000, live.length > 0);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createCourse(name.trim());
      setName(''); setCreating(false); setError(null);
      courses.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  const refreshAll = () => { courses.refresh(); sessions.refresh(); pending.refresh(); };
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pendingCount = pending.data?.requests.length ?? 0;
  const past = (sessions.data?.sessions ?? []).filter((s) => !s.active).slice(0, 10);

  return (
    <Screen refreshing={courses.refreshing || sessions.refreshing} onRefresh={refreshAll}>
      <Enter index={0}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          <View>
            <Caption>{greet},</Caption>
            <H1>{firstName(user?.name)}</H1>
          </View>
          <LogoMark size={44} glow={false} />
        </Row>
      </Enter>

      {live.map((s, i) => (
        <Card key={s.id} tone="success" onPress={() => router.push({ pathname: '/(organiser)/session/[id]', params: { id: s.id } })} enter={i + 1}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={12} style={{ flex: 1 }}>
              <PulseDot color={t.success} size={10} />
              <View style={{ flex: 1 }}>
                <Row gap={8}>
                  <P strong>Live now</P>
                  <Pill label={fmtCountdown(s.endsAt - Date.now())} tone="success" icon="time-outline" />
                </Row>
                <Caption numberOfLines={1}>{s.title ? `${s.title} · ` : ''}{s.courseName}</Caption>
                <Caption color={t.success}>{s.presentCount}/{s.enrolledCount} marked · open dashboard</Caption>
              </View>
            </Row>
            <Ionicons name="chevron-forward" size={18} color={t.success} />
          </Row>
        </Card>
      ))}

      {pendingCount > 0 && (
        <Card tone="warning" onPress={() => router.push('/(organiser)/approvals')} enter={live.length + 1}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10}>
              <Ionicons name="shield-half-outline" size={20} color={t.warning} />
              <P strong>{pendingCount} device switch{pendingCount > 1 ? 'es' : ''} to review</P>
            </Row>
            <Ionicons name="chevron-forward" size={18} color={t.warning} />
          </Row>
        </Card>
      )}

      <SectionTitle right={
        <Pressable onPress={() => setCreating((c) => !c)}>
          <Row gap={4}><Ionicons name={creating ? 'close' : 'add'} size={16} color={t.primary} /><Caption color={t.primary}>{creating ? 'Cancel' : 'New course'}</Caption></Row>
        </Pressable>
      }>Your courses</SectionTitle>

      {creating && (
        <Card enter={0}>
          <Banner message={error} onDismiss={() => setError(null)} />
          <Input label="Course name" icon="book-outline" value={name} onChangeText={setName} placeholder="e.g. Distributed Systems" autoFocus onSubmitEditing={create} />
          <Button title="Create course" onPress={create} loading={busy} />
        </Card>
      )}

      <Banner message={courses.error} tone="danger" />
      {courses.loading ? <Loading /> : !courses.data?.courses.length ? (
        <Empty icon={<Ionicons name="layers-outline" size={36} color={t.textFaint} />} title="No courses yet" body="Create a course, share its join code with students, then start a session when class begins." />
      ) : courses.data.courses.map((c, i) => (
        <Card key={c.id} onPress={() => router.push(`/(organiser)/course/${c.id}`)} enter={i + 2}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <P strong style={{ fontSize: 17 }}>{c.name}</P>
              <Row gap={14} style={{ marginTop: 6 }}>
                <Row gap={4}><Ionicons name="people-outline" size={14} color={t.textMuted} /><Caption>{c.studentCount} students</Caption></Row>
                <Row gap={4}><Ionicons name="time-outline" size={14} color={t.textMuted} /><Caption>{c.sessionCount} sessions</Caption></Row>
              </Row>
            </View>
            <Pill label={c.code} tone="neutral" />
          </Row>
        </Card>
      ))}

      <SectionTitle>Recent lectures</SectionTitle>
      <Banner message={sessions.error} tone="danger" />
      {sessions.loading ? <Loading rows={2} /> : !past.length ? (
        <Caption style={{ marginBottom: space.md }}>{live.length ? 'Finished lectures will appear here with their attendance records.' : 'No lectures yet. Open a course and start a session.'}</Caption>
      ) : past.map((s, i) => {
        const pct = s.enrolledCount ? Math.round((s.presentCount / s.enrolledCount) * 100) : null;
        const tone = pct === null ? 'neutral' : pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'danger';
        return (
          <Card key={s.id} onPress={() => router.push({ pathname: '/(organiser)/session/[id]', params: { id: s.id } })} style={{ paddingVertical: 14 }} enter={i}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <P strong numberOfLines={1}>{s.title || s.courseName}</P>
                <Caption numberOfLines={1}>{s.title ? `${s.courseName} · ` : ''}{fmtDateTime(s.startedAt)} · {fmtDuration(s.durationSec)}</Caption>
              </View>
              <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: 18 }}>{s.presentCount}<Text style={{ color: t.textFaint, fontSize: 13 }}>/{s.enrolledCount}</Text></Text>
                <Pill label={pct === null ? 'NO ROSTER' : `${pct}%`} tone={tone} />
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
