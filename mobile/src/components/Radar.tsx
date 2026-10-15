import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

type Mode = 'idle' | 'scanning' | 'found' | 'marked' | 'error';

function Pulse({ delay, color, size, active }: { delay: number; color: string; size: number; active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
    else p.value = withTiming(0, { duration: 300 });
  }, [active, delay, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.5 + p.value * 0.9 }], opacity: (1 - p.value) * 0.5 }));
  return <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, style]} />;
}

/** Beacon-style radar used on the student home screen. */
export function Radar({ mode, size = 230 }: { mode: Mode; size?: number }) {
  const t = useTheme();
  const color = { idle: t.textFaint, scanning: t.primary, found: t.accent, marked: t.success, error: t.danger }[mode];
  const icon = { idle: 'bluetooth-outline', scanning: 'bluetooth', found: 'radio-outline', marked: 'checkmark', error: 'alert' }[mode] as any;
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breathe]);
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mode === 'scanning' || mode === 'found' ? 1 + breathe.value * 0.06 : 1 }],
  }));
  const active = mode === 'scanning' || mode === 'found';
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Pulse delay={0} color={color} size={size} active={active} />
      <Pulse delay={800} color={color} size={size} active={active} />
      <Pulse delay={1600} color={color} size={size} active={active} />
      <View style={[styles.ring, { width: size * 0.62, height: size * 0.62, borderRadius: size, borderColor: t.border, opacity: 0.8 }]} />
      <Animated.View style={[styles.core, { width: size * 0.4, height: size * 0.4, borderRadius: size, backgroundColor: color, shadowColor: color }, coreStyle]}>
        <Ionicons name={icon} size={size * 0.18} color="#fff" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  core: { alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
});
