import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius } from '../theme';
import { Layout } from '../motion';
import { roleForEmail, hasDomainPart, Domains } from '../roles';

/** Shows what kind of account an email address maps to, as the user types. */
export function RoleChip({ email, domains }: { email: string; domains: Domains }) {
  const t = useTheme();
  if (!hasDomainPart(email)) return null;
  const role = roleForEmail(email, domains);
  const spec = role === 'student'
    ? { icon: 'school' as const, color: t.primary, bg: t.primaryBg, title: 'Student account', body: `@${domains.student} · marked automatically, bound to this phone` }
    : role === 'organiser'
      ? { icon: 'megaphone' as const, color: t.success, bg: t.successBg, title: 'Organiser account', body: `@${domains.organiser} · run sessions, approvals and reports` }
      : { icon: 'alert-circle' as const, color: t.warning, bg: t.warningBg, title: 'Unknown email domain', body: `Use @${domains.student} (students) or @${domains.organiser} (staff)` };
  return (
    <Animated.View key={role ?? 'none'} entering={FadeInUp.duration(260)} exiting={FadeOut.duration(150)} layout={Layout}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: spec.bg, padding: 12, borderRadius: radius.md, marginBottom: 16, marginTop: -6 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: spec.color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={spec.icon} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: spec.color, fontWeight: '700' }}>{spec.title}</Text>
        <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 1 }}>{spec.body}</Text>
      </View>
    </Animated.View>
  );
}
