import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth';
import { firebaseInfo } from '../api';
import { hasNativeAdvertiser, hasNativeScanner } from '../ble';
import { Screen, Card, Avatar, P, Caption, Button, Pill, Divider, Row, H2 } from './ui';
import { useTheme, space } from '../theme';

export function ProfileScreen() {
  const t = useTheme();
  const { user, device, signOut } = useAuth();
  if (!user) return null;
  const isStudent = user.role === 'student';
  const nativeBle = isStudent ? hasNativeScanner : hasNativeAdvertiser;

  return (
    <Screen>
      <H2 style={{ marginBottom: space.lg }}>Profile</H2>
      <Card enter={0}>
        <Row gap={14}>
          <Avatar name={user.name} size={56} />
          <View style={{ flex: 1 }}>
            <P strong style={{ fontSize: 18 }}>{user.name}</P>
            <Caption>{user.email}</Caption>
            <Row gap={6} style={{ marginTop: 6 }}>
              <Pill label={isStudent ? 'STUDENT' : 'ORGANISER'} />
              {user.studentCode && <Pill label={user.studentCode} tone="neutral" />}
            </Row>
          </View>
        </Row>
      </Card>

      <Card enter={1}>
        <Row gap={10} style={{ marginBottom: 8 }}>
          <Ionicons name="phone-portrait-outline" size={18} color={t.primary} />
          <P strong>This device</P>
        </Row>
        <Caption>{device?.name}</Caption>
        <Caption color={t.textFaint} style={{ marginTop: 2 }} numberOfLines={1}>{device?.id}</Caption>
        {isStudent && (
          <>
            <Divider />
            <Caption>
              {user.deviceId === device?.id
                ? 'Bound to your account. Attendance can only be marked from here.'
                : 'Not the device bound to your account.'}
            </Caption>
          </>
        )}
        <Divider />
        <Row gap={8}>
          <Ionicons name={nativeBle ? 'bluetooth' : 'flask-outline'} size={16} color={nativeBle ? t.success : t.warning} />
          <Caption color={nativeBle ? t.success : t.warning}>
            {nativeBle ? 'Native Bluetooth available' : 'Simulated Bluetooth (Expo Go / web). Build a dev client for real BLE.'}
          </Caption>
        </Row>
      </Card>

      <Card enter={2}>
        <Row gap={10}>
          <Ionicons name="cloud-outline" size={18} color={t.primary} />
          <View style={{ flex: 1 }}>
            <P strong>Backend</P>
            <Caption numberOfLines={1}>{firebaseInfo.emulator ? `Firebase emulator · ${firebaseInfo.emulator}` : `Firebase project · ${firebaseInfo.projectId}`}</Caption>
          </View>
        </Row>
      </Card>

      <Button title="Sign out" variant="danger" onPress={async () => { await signOut(); router.replace('/(auth)/login'); }} />
    </Screen>
  );
}
