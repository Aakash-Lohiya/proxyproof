import React, { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTween, Layout, EnterUp } from '@/motion';
import { api } from '@/api';
import { useAsync } from '@/hooks';
import { fmtDateTime, fmtTime, pct } from '@/format';
import { Screen, Card, H2, P, Caption, Banner, Row, Empty, Loading, Pill, Progress, SectionTitle } from '@/components/ui';
import { useTheme, space } from '@/theme';

function Ring({ value, size = 120 }: { value: number | null; size?: number }) {
  const t = useTheme();
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useTween(value ?? 0, 1100);
  const color = value === null ? t.textFaint : v >= 75 ? t.success : v >= 50 ? t.warning : t.danger;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - v / 100)} />
      </Svg>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: size * 0.22, letterSpacing: -1 }}>{value === null ? '—' : `${Math.round(v)}%`}</Text>
      <Caption style={{ fontSize: 11 }}>overall</Caption>
    </View>
  );
}

export default function History() {
  const t = useTheme();
  const hist = useAsync(() => api.myHistory());
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen refreshing={hist.refreshing} onRefresh={hist.refresh}>
      <H2>Your attendance</H2>
      <Banner message={hist.error} />
      {hist.loading && !hist.data ? <Loading /> : !hist.data ? null : (
        <>
          <Card style={{ marginTop: space.lg }} enter={0}>
            <Row gap={20}>
              <Ring value={hist.data.overall.percentage} />
              <View style={{ flex: 1 }}>
                <P strong style={{ fontSize: 18 }}>{hist.data.overall.present} of {hist.data.overall.total}</P>
                <Caption>sessions attended across {hist.data.courses.length} course{hist.data.courses.length === 1 ? '' : 's'}</Caption>
                {hist.data.overall.percentage !== null && hist.data.overall.percentage < 75 && (
                  <Row gap={6} style={{ marginTop: 10 }}>
                    <Ionicons name="warning-outline" size={14} color={t.warning} />
                    <Caption color={t.warning}>Below the usual 75% requirement</Caption>
                  </Row>
                )}
              </View>
            </Row>
          </Card>

          <SectionTitle>By course</SectionTitle>
          {!hist.data.courses.length ? <Empty icon={<Ionicons name="school-outline" size={32} color={t.textFaint} />} title="No courses yet" body="Join a course from the Attend tab." />
            : hist.data.courses.map((c, i) => {
              const isOpen = open === c.course.id;
              const tone = c.percentage === null ? 'primary' : c.percentage >= 75 ? 'success' : c.percentage >= 50 ? 'warning' : 'danger';
              return (
                <Card key={c.course.id} onPress={() => setOpen(isOpen ? null : c.course.id)} enter={i + 1}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <P strong>{c.course.name}</P>
                      <Caption>{c.present}/{c.total} sessions</Caption>
                    </View>
                    <Text style={{ color: t[tone], fontWeight: '800', fontSize: 20 }}>{pct(c.percentage)}</Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={t.textFaint} style={{ marginLeft: 8 }} />
                  </Row>
                  <View style={{ marginTop: 10 }}><Progress value={c.percentage ?? 0} tone={tone} /></View>
                  {isOpen && (
                    <Animated.View entering={FadeIn.duration(220)} layout={Layout} style={{ marginTop: 12 }}>
                      {!c.sessions.length ? <Caption>No sessions held yet.</Caption> : c.sessions.map((s, j) => (
                        <Animated.View key={s.id} entering={EnterUp.delay(j * 40)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                          <Ionicons name={s.present ? 'checkmark-circle' : s.active ? 'radio-outline' : 'close-circle-outline'} size={20} color={s.present ? t.success : s.active ? t.primary : t.danger} />
                          <View style={{ flex: 1 }}>
                            <P style={{ fontSize: 14 }}>{s.title || fmtDateTime(s.startedAt)}</P>
                            <Caption>{s.title ? fmtDateTime(s.startedAt) : ''}{s.present && s.markedAt ? ` · marked ${fmtTime(s.markedAt)}` : ''}</Caption>
                          </View>
                          <Pill label={s.present ? 'PRESENT' : s.active ? 'LIVE' : 'ABSENT'} tone={s.present ? 'success' : s.active ? 'primary' : 'danger'} />
                        </Animated.View>
                      ))}
                    </Animated.View>
                  )}
                </Card>
              );
            })}
        </>
      )}
    </Screen>
  );
}
