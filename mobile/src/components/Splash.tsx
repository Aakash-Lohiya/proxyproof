import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, runOnJS,
} from 'react-native-reanimated';
import { LogoMark } from './Logo';

const BG = '#0B1020';

function Ring({ delay, size }: { delay: number; size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.55 + p.value * 1.1 }],
    opacity: (1 - p.value) * 0.55,
  }));
  return <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

/**
 * Animated launch screen: logo scales in with a soft overshoot, pulse rings
 * radiate like a BLE beacon, the word-mark fades up, then a progress bar fills.
 * Calls `onDone` once the minimum showtime has elapsed AND `ready` is true.
 */
export function Splash({ ready, onDone, minimumMs = 2000 }: { ready: boolean; onDone: () => void; minimumMs?: number }) {
  const logo = useSharedValue(0);
  const text = useSharedValue(0);
  const bar = useSharedValue(0);
  const fade = useSharedValue(1);
  const [minElapsed, setMinElapsed] = React.useState(false);

  useEffect(() => {
    logo.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.6)) });
    text.value = withDelay(500, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    bar.value = withDelay(400, withTiming(0.85, { duration: minimumMs - 400, easing: Easing.inOut(Easing.quad) }));
    const t = setTimeout(() => setMinElapsed(true), minimumMs);
    return () => clearTimeout(t);
  }, [logo, text, bar, minimumMs]);

  useEffect(() => {
    if (!minElapsed || !ready) return;
    bar.value = withTiming(1, { duration: 250 });
    fade.value = withDelay(250, withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    }));
  }, [minElapsed, ready, bar, fade, onDone]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ scale: 0.6 + logo.value * 0.4 }, { translateY: (1 - logo.value) * 24 }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: (1 - text.value) * 14 }],
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const wrapStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, wrapStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Ring delay={0} size={220} />
        <Ring delay={700} size={220} />
        <Ring delay={1400} size={220} />
        <Animated.View style={logoStyle}>
          <LogoMark size={128} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.textWrap, textStyle]}>
        <Text style={styles.word}>
          Proxy<Text style={styles.wordAccent}>Proof</Text>
        </Text>
        <Text style={styles.tag}>PROOF OF PRESENCE</Text>
      </Animated.View>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barStyle]} />
      </View>
      <Text style={styles.footer}>Bluetooth attendance · no proxies</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: BG, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: '#4F8CFF' },
  textWrap: { alignItems: 'center', marginTop: 8 },
  word: { color: '#F2F5FF', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  wordAccent: { color: '#4F8CFF' },
  tag: { color: '#9AA6C7', marginTop: 6, fontSize: 12, letterSpacing: 4, fontWeight: '600' },
  barTrack: { marginTop: 44, width: 160, height: 4, borderRadius: 2, backgroundColor: '#1C2640', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: '#22D3EE' },
  footer: { position: 'absolute', bottom: 48, color: '#5F6B8C', fontSize: 12, letterSpacing: 0.5 },
});
