import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (user) return <Redirect href={user.role === 'organiser' ? '/(organiser)' : '/(student)'} />;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
