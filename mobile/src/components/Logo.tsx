import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * ProxyProof mark: a shield (proof) whose core is a Bluetooth rune that doubles
 * as a check-mark, with two signal arcs sweeping out of it.
 */
export function LogoMark({ size = 96, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="ppShield" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4F8CFF" />
          <Stop offset="1" stopColor="#22D3EE" />
        </LinearGradient>
        <LinearGradient id="ppShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {glow && <Circle cx="60" cy="62" r="52" fill="#4F8CFF" opacity="0.14" />}
      {/* shield */}
      <Path
        d="M60 10 L98 24 V58 C98 82 82 100 60 110 C38 100 22 82 22 58 V24 Z"
        fill="url(#ppShield)"
      />
      <Path d="M60 10 L98 24 V58 C98 82 82 100 60 110 C38 100 22 82 22 58 V24 Z" fill="url(#ppShade)" />
      {/* bluetooth rune / check hybrid */}
      <G stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M60 36 V84" />
        <Path d="M60 36 L74 48 L46 72" />
        <Path d="M60 84 L74 72 L46 48" />
      </G>
      {/* signal arcs */}
      <G stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.9">
        <Path d="M84 46 A20 20 0 0 1 84 74" />
        <Path d="M93 38 A32 32 0 0 1 93 82" opacity="0.6" />
      </G>
    </Svg>
  );
}

export function LogoLockup({ size = 40, vertical = false }: { size?: number; vertical?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.row, vertical && styles.col]}>
      <LogoMark size={size} glow={false} />
      <View style={vertical ? { alignItems: 'center', marginTop: 10 } : { marginLeft: 10 }}>
        <Text style={[styles.word, { color: t.text, fontSize: size * 0.55 }]}>
          Proxy<Text style={{ color: t.primary }}>Proof</Text>
        </Text>
        {vertical && <Text style={[styles.tag, { color: t.textMuted }]}>Proof of presence</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flexDirection: 'column' },
  word: { fontWeight: '800', letterSpacing: -0.8 },
  tag: { marginTop: 4, fontSize: 13, letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: '600' },
});
