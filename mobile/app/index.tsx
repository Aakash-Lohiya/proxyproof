import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';

export default function Index() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href={user.role === 'organiser' ? '/(organiser)' : '/(student)'} />;
}
