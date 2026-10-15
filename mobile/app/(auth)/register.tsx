import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth';
import { useDomains, roleForEmail } from '@/roles';
import { AuthHero } from '@/components/AuthHero';
import { RoleChip } from '@/components/RoleChip';
import { Screen, Input, PasswordInput, Button, Banner, Caption, Card } from '@/components/ui';
import { Enter, useShake, haptic, Layout } from '@/motion';
import { useTheme, radius, space } from '@/theme';

export default function Register() {
  const t = useTheme();
  const { register, device } = useAuth();
  const domains = useDomains();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { style: shakeStyle, shake } = useShake();
  const role = roleForEmail(email, domains);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) { shake(); return setError('Fill in your name, email and password'); }
    if (!role) { shake(); return setError(`Use your @${domains.student} or @${domains.organiser} email`); }
    if (password.length < 6) { shake(); return setError('Password must be at least 6 characters'); }
    setBusy(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, studentCode: studentCode.trim() || undefined });
      haptic.success();
      router.replace('/');
    } catch (e) {
      shake();
      setError(e instanceof Error ? e.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AuthHero compact title="Create your account" subtitle="Your email domain decides what you can do. No role to pick." />
      <Enter index={2}>
        <Animated.View style={shakeStyle}>
          <Card>
            <Banner message={error} onDismiss={() => setError(null)} />
            <Input label="Institute email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={`name@${domains.student}`} />
            <RoleChip email={email} domains={domains} />
            <Input label="Full name" icon="person-outline" value={name} onChangeText={setName} placeholder="Asha Verma" autoComplete="name" />
            {role === 'student' && (
              <Animated.View layout={Layout}>
                <Input label="Registration number" icon="id-card-outline" value={studentCode} onChangeText={setStudentCode} autoCapitalize="characters" placeholder="22BCE1234" />
              </Animated.View>
            )}
            <PasswordInput label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" onSubmitEditing={submit} returnKeyType="go" />
            {role === 'student' && (
              <Animated.View layout={Layout} style={{ flexDirection: 'row', gap: 10, backgroundColor: t.warningBg, padding: 12, borderRadius: radius.md, marginBottom: space.lg }}>
                <Ionicons name="phone-portrait-outline" size={18} color={t.warning} />
                <Caption color={t.warning} style={{ flex: 1 }}>
                  This account will be locked to this device{device ? ` (${device.name})` : ''}. Switching phones later needs organiser approval.
                </Caption>
              </Animated.View>
            )}
            <Button
              title={role === 'student' ? 'Register this device' : role === 'organiser' ? 'Create organiser account' : 'Continue'}
              onPress={submit} loading={busy} size="lg"
              icon={<Ionicons name={role === 'student' ? 'bluetooth' : 'arrow-forward'} size={18} color={t.primaryText} />}
            />
          </Card>
        </Animated.View>
      </Enter>
      <Enter index={3}>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Text style={{ color: t.textMuted }}>
            Already registered?{' '}
            <Link href="/(auth)/login" style={{ color: t.primary, fontWeight: '700' }}>Sign in</Link>
          </Text>
        </View>
      </Enter>
    </Screen>
  );
}
