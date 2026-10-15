import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { Screen, Input, PasswordInput, Button, Banner, P, Caption, Card, H2, Pill } from '@/components/ui';
import { Pop } from '@/motion';
import { useTheme, space } from '@/theme';

export default function DeviceSwitch() {
  const t = useTheme();
  const { device } = useAuth();
  const params = useLocalSearchParams<{ email?: string; bound?: string; pending?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { alreadyPending: boolean }>(params.pending === '1' ? { alreadyPending: true } : null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password');
    if (!device) return setError('Device identity not ready yet');
    setBusy(true);
    try {
      const res = await api.deviceChange({ email: email.trim(), password, newDeviceId: device.id, newDeviceName: device.name });
      setDone({ alreadyPending: res.alreadyPending });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 16 }}>
        <Pop>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.warningBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="swap-horizontal" size={28} color={t.warning} />
          </View>
        </Pop>
        <H2>New device detected</H2>
        <P muted style={{ marginTop: 6 }}>
          Your account is bound to {params.bound ? <P strong>{params.bound}</P> : 'another phone'}. To stop proxy attendance, each student can only mark from one device.
          Ask an organiser to approve the switch.
        </P>
      </View>

      {done ? (
        <Card tone="warning" enter={1}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Pill label="PENDING APPROVAL" tone="warning" />
          </View>
          <P strong>{done.alreadyPending ? 'A request is already waiting' : 'Request sent'}</P>
          <Caption style={{ marginTop: 4 }}>
            Once an organiser approves it, sign in again on this device. Your old phone will stop working.
          </Caption>
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/(auth)/login')} style={{ marginTop: space.lg }} />
        </Card>
      ) : (
        <Card enter={1}>
          <Banner message={error} onDismiss={() => setError(null)} />
          <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <PasswordInput label="Password" value={password} onChangeText={setPassword} />
          <Caption style={{ marginBottom: space.lg }}>New device: {device?.name ?? '…'}</Caption>
          <Button title="Request device switch" onPress={submit} loading={busy} size="lg" />
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: 10 }} />
        </Card>
      )}
    </Screen>
  );
}
