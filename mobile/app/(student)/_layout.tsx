import React from 'react';
import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';
import { TabIcon } from '@/components/TabIcon';

export default function StudentLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'student') return <Redirect href="/(organiser)" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.primary,
      tabBarInactiveTintColor: t.textFaint,
      tabBarStyle: { backgroundColor: t.bgElevated, borderTopColor: t.border, height: 64, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Attend', tabBarIcon: (p) => <TabIcon name="bluetooth" {...p} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: (p) => <TabIcon name="stats-chart" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon name="person-circle" {...p} /> }} />
    </Tabs>
  );
}
