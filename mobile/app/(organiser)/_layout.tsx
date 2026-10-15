import React from 'react';
import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';
import { TabIcon } from '@/components/TabIcon';

export default function OrganiserLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  // Hold rendering until the stored login is read, otherwise deep links fetch without a token.
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'organiser') return <Redirect href="/(student)" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.primary,
      tabBarInactiveTintColor: t.textFaint,
      tabBarStyle: { backgroundColor: t.bgElevated, borderTopColor: t.border, height: 64, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Courses', tabBarIcon: (p) => <TabIcon name="layers" {...p} /> }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: (p) => <TabIcon name="shield-checkmark" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon name="person-circle" {...p} /> }} />
      <Tabs.Screen name="course/[id]" options={{ href: null }} />
      <Tabs.Screen name="session/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
