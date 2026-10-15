import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth';
import { ApiError, firebaseInfo } from '@/api';
import { useDomains, roleForEmail } from '@/roles';
import { AuthHero } from '@/components/AuthHero';
import { RoleChip } from '@/components/RoleChip';
import { Screen, Input, PasswordInput, Button, Banner, Caption, Card } from '@/components/ui';
import { Enter, useShake, haptic } from '@/motion';
import { useTheme, space } from '@/theme';

export default function Login() {
  const t = useTheme();
  const { signIn, device } = useAuth();
  const domains = useDomains();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { style: shakeStyle, shake } = useShake();

  const role = roleForEmail(email, domains);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { shake(); return setError('Enter your email and password'); }
    if (!role) { shake(); return setError(`Sign in with your @${domains.student} or @${domains.organiser} email`); }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      haptic.success();
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DEVICE_MISMATCH') {
        router.push({ pathname: '/(auth)/device-switch', params: { email: email.trim(), bound: String(e.extra.boundDeviceName ?? ''), pending: e.extra.pendingRequest ? '1' : '0' } });
      } else {
        shake();
        setError(e instanceof Error ? e.message : 'Sign in failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AuthHero title="Welcome back" subtitle="Sign in with your institute email. Students are marked automatically; staff run the sessions." />
      {!firebaseInfo.configured && (
        <Banner tone="warning" message="Firebase is not configured yet. Add EXPO_PUBLIC_FIREBASE_* values to mobile/.env (see .env.example)." />
      )}
      <Enter index={2}>
        <Animated.View style={shakeStyle}>
          <Card>
            <Banner message={error} onDismiss={() => setError(null)} />
            <Input label="Institute email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
              placeholder={`name@${domains.student}`} textContentType="emailAddress" />
            <RoleChip email={email} domains={domains} />
            <PasswordInput label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" onSubmitEditing={submit} returnKeyType="go" />
            <Button
              title={role === 'organiser' ? 'Sign in as organiser' : role === 'student' ? 'Sign in as student' : 'Sign in'}
              onPress={submit} loading={busy} size="lg"
              icon={<Ionicons name="arrow-forward" size={18} color={t.primaryText} />}
            />
          </Card>
        </Animated.View>
      </Enter>

      <Enter index={3}>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Text style={{ color: t.textMuted }}>
            First time here?{' '}
            <Link href="/(auth)/register" style={{ color: t.primary, fontWeight: '700' }}>Create your account</Link>
          </Text>
          <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="cloud-outline" size={14} color={t.textFaint} />
            <Caption color={t.textFaint}>{firebaseInfo.emulator ? `Local emulator · ${firebaseInfo.emulator}` : `Firebase · ${firebaseInfo.projectId}`}</Caption>
          </View>
          {device && <Caption color={t.textFaint} style={{ marginTop: 10 }}>This device · {device.name}</Caption>}
        </View>
      </Enter>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
