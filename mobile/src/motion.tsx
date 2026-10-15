// Shared motion primitives: entrances, press feedback, count-ups, pulses, skeletons, haptics.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, FadeOutLeft, LinearTransition, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export const Layout = LinearTransition.springify().damping(18);
// Note: custom easings on layout animations are not supported on web (Reanimated warns), so none are set here.
export const EnterUp = FadeInUp.duration(420);
export const ExitLeft = FadeOutLeft.duration(260);

/** Fade + slide in, staggered by `index`. Use around cards and list rows. */
export function Enter({ index = 0, children, style, delay = 0 }: { index?: number; children: React.ReactNode; style?: ViewStyle; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(460).delay(delay + Math.min(index, 10) * 60)} layout={Layout} style={style}>
      {children}
    </Animated.View>
  );
}

/** Pop-in with spring. For success states and badges. */
export function Pop({ children, style, delay = 0 }: { children: React.ReactNode; style?: ViewStyle; delay?: number }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(12).stiffness(140).delay(delay)} style={style}>
      {children}
    </Animated.View>
  );
}

export const haptic = {
  light: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that squishes and gives a light haptic. */
export function Press({ children, style, onPress, scaleTo = 0.96, disabled, hapticOnPress = true, ...rest }: Omit<PressableProps, 'style'> & {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { s.value = withSpring(scaleTo, { damping: 14, stiffness: 300 }); rest.onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, { damping: 14, stiffness: 300 }); rest.onPressOut?.(e); }}
      onPress={(e) => { if (hapticOnPress) haptic.light(); onPress?.(e); }}
      style={[a, style as any]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Animates a number from its previous value to `value`. */
export function CountUp({ value, style, duration = 600, format }: { value: number; style?: TextStyle; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const t0 = Date.now();
    if (start === value) return;
    let raf: number;
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <Text style={style}>{format ? format(shown) : Math.round(shown)}</Text>;
}

/** JS tween of a numeric value, for things like SVG progress rings. */
export function useTween(target: number, duration = 800) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = Date.now();
    let raf: number;
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = start + (target - start) * e;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/** Breathing dot for "live" indicators. */
export function PulseDot({ color, size = 8, active = true }: { color: string; size?: number; active?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = active ? withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false) : 0;
  }, [active, p]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 2.2 }], opacity: (1 - p.value) * 0.6 }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {active && <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, halo]} />}
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/** Horizontal shake for invalid form submissions. */
export function useShake() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = () => {
    haptic.error();
    x.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(-5, { duration: 50 }), withTiming(5, { duration: 50 }), withTiming(0, { duration: 50 }));
  };
  return { style, shake };
}

/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style, color }: { width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle; color: string }) {
  const p = useSharedValue(0.4);
  useEffect(() => {
    p.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })), -1, true);
  }, [p]);
  const a = useAnimatedStyle(() => ({ opacity: p.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: color }, a, style]} />;
}

/** Slides a new value in whenever `k` changes (e.g. rotating token). */
export function Swap({ k, children, style }: { k: string | number; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <Animated.View key={String(k)} entering={FadeInUp.duration(260)} style={style}>
      {children}
    </Animated.View>
  );
}

export const motionStyles = StyleSheet.create({});
