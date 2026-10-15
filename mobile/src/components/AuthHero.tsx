import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark } from './Logo';
import { useTheme } from '../theme';

/** Gradient header with a floating logo, shared by the auth screens. */
export function AuthHero({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [y]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + y.value * 12 }] }));
  const orb1 = useAnimatedStyle(() => ({ transform: [{ translateX: y.value * 18 }, { translateY: y.value * -10 }] }));
  const orb2 = useAnimatedStyle(() => ({ transform: [{ translateX: y.value * -14 }, { translateY: y.value * 12 }] }));
  return (
    <LinearGradient colors={t.dark ? ['#101B3D', '#0B1020'] : ['#DCE7FF', t.bg]} style={[styles.hero, { paddingTop: insets.top + (compact ? 12 : 28), paddingBottom: compact ? 20 : 30 }]}>
      <Animated.View style={[styles.orb, { backgroundColor: '#4F8CFF', top: -40, right: -30 }, orb1]} />
      <Animated.View style={[styles.orb, { backgroundColor: '#22D3EE', bottom: -60, left: -40, width: 180, height: 180 }, orb2]} />
      <Animated.View entering={FadeInDown.duration(500)} style={[{ alignItems: 'center' }, float]}>
        <LogoMark size={compact ? 64 : 92} />
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(500).delay(120)} style={{ alignItems: 'center', marginTop: compact ? 6 : 10 }}>
        <Text style={[styles.word, { color: t.text }]}>Proxy<Text style={{ color: t.primary }}>Proof</Text></Text>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: t.textMuted }]}>{subtitle}</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: -16, marginTop: -12, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', alignItems: 'center', marginBottom: 20 },
  orb: { position: 'absolute', width: 140, height: 140, borderRadius: 100, opacity: 0.16 },
  word: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 14, textAlign: 'center' },
  sub: { marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
