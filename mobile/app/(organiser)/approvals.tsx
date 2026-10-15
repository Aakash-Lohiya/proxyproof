import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api';
import { useAsync } from '@/hooks';
import { fmtDateTime } from '@/format';
import { Screen, Card, H2, P, Caption, Button, Banner, Row, Avatar, Empty, Loading, Pill, SectionTitle } from '@/components/ui';
import { useTheme, space } from '@/theme';

export default function Approvals() {
  const t = useTheme();
  const pending = useAsync(() => api.deviceRequests('pending'));
  const history = useAsync(() => Promise.all([api.deviceRequests('approved'), api.deviceRequests('rejected')]).then(([a, r]) =>
    [...a.requests, ...r.requests].sort((x, y) => (y.resolvedAt ?? 0) - (x.resolvedAt ?? 0)).slice(0, 10)));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await api.resolveDeviceRequest(id, action);
      pending.refresh(); history.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusyId(null); }
  };

  return (
    <Screen refreshing={pending.refreshing} onRefresh={() => { pending.refresh(); history.refresh(); }}>
      <H2>Device approvals</H2>
      <P muted style={{ marginTop: 4, marginBottom: space.md }}>Each student is locked to one phone. Approve a switch only if you trust the reason.</P>
      <Banner message={error} onDismiss={() => setError(null)} />
      {pending.loading ? <Loading /> : !pending.data?.requests.length ? (
        <Empty icon={<Ionicons name="shield-checkmark-outline" size={36} color={t.success} />} title="All clear" body="No pending device-switch requests." />
      ) : pending.data.requests.map((r, i) => (
        <Card key={r.id} enter={i}>
          <Row gap={12}>
            <Avatar name={r.student.name} />
            <View style={{ flex: 1 }}>
              <P strong>{r.student.name}</P>
              <Caption>{r.student.studentCode ? `${r.student.studentCode} · ` : ''}{r.student.email}</Caption>
            </View>
          </Row>
          <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: t.surfaceAlt }}>
            <Row gap={8}>
              <Caption>{r.currentDeviceName ?? 'Old device'}</Caption>
              <Ionicons name="arrow-forward" size={14} color={t.textMuted} />
              <Caption color={t.text}>{r.newDeviceName ?? 'New device'}</Caption>
            </Row>
            <Caption color={t.textFaint} style={{ marginTop: 4 }}>Requested {fmtDateTime(r.createdAt)}</Caption>
          </View>
          <Row style={{ marginTop: 12 }}>
            <Button title="Reject" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => act(r.id, 'reject')} loading={busyId === r.id} />
            <Button title="Approve" variant="success" size="sm" style={{ flex: 1 }} onPress={() => act(r.id, 'approve')} loading={busyId === r.id} />
          </Row>
        </Card>
      ))}

      {!!history.data?.length && (
        <>
          <SectionTitle>Recently resolved</SectionTitle>
          {history.data.map((r, i) => (
            <Card key={r.id} style={{ paddingVertical: 12 }} enter={i}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <P strong>{r.student.name}</P>
                  <Caption>{fmtDateTime(r.resolvedAt)}</Caption>
                </View>
                <Pill label={r.status.toUpperCase()} tone={r.status === 'approved' ? 'success' : 'danger'} />
              </Row>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
