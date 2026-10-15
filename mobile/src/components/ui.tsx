import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, TextStyle, ScrollView,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, space, font } from '../theme';
import { initials } from '../format';
import { Press, CountUp, Enter, Skeleton, Layout, haptic } from '../motion';

// ---- Screen ----------------------------------------------------------------
export function Screen({ children, scroll = true, padded = true, refreshing, onRefresh, style }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; refreshing?: boolean; onRefresh?: () => void; style?: ViewStyle;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner = { paddingHorizontal: padded ? space.lg : 0, paddingTop: space.md, paddingBottom: insets.bottom + 100 };
  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }, style]}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[inner, { paddingTop: insets.top + space.md }, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Typography --------------------------------------------------------------
export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[font.display, { color: t.text }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[font.title, { color: t.text }, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[font.heading, { color: t.text }, style]}>{children}</Text>;
}
export function P({ children, muted, style, strong, numberOfLines }: { children: React.ReactNode; muted?: boolean; strong?: boolean; style?: TextStyle; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[strong ? font.bodyStrong : font.body, { color: muted ? t.textMuted : t.text, lineHeight: 22 }, style]}>{children}</Text>;
}
export function Caption({ children, style, color, numberOfLines }: { children: React.ReactNode; style?: TextStyle; color?: string; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[font.caption, { color: color ?? t.textMuted }, style]}>{children}</Text>;
}
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: t.textFaint }]}>{children}</Text>
      {right}
    </View>
  );
}

// ---- Card ------------------------------------------------------------------
export function Card({ children, style, onPress, tone, enter }: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void; tone?: 'primary' | 'success' | 'warning' | 'danger';
  /** stagger index for the entrance animation; omit for no entrance */
  enter?: number;
}) {
  const t = useTheme();
  const bg = tone ? t[`${tone}Bg` as const] : t.surface;
  const border = tone ? 'transparent' : t.border;
  let body: React.ReactNode = (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border, shadowColor: t.shadow }, style]}>{children}</View>
  );
  if (onPress) {
    body = <Press onPress={onPress} scaleTo={0.98}>{body}</Press>;
  }
  if (enter !== undefined) return <Enter index={enter}>{body}</Enter>;
  return <>{body}</>;
}

// ---- Button ----------------------------------------------------------------
export function Button({ title, onPress, variant = 'primary', loading, disabled, style, icon, size = 'md' }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  loading?: boolean; disabled?: boolean; style?: ViewStyle; icon?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTheme();
  const bg = { primary: t.primary, secondary: t.surfaceAlt, ghost: 'transparent', danger: t.dangerBg, success: t.success }[variant];
  const fg = { primary: t.primaryText, secondary: t.text, ghost: t.primary, danger: t.danger, success: '#06281B' }[variant];
  const h = { sm: 38, md: 50, lg: 58 }[size];
  const isDisabled = disabled || loading;
  return (
    <Press
      onPress={onPress}
      disabled={isDisabled}
      hapticOnPress={variant !== 'ghost'}
      style={[
        styles.btn, { backgroundColor: bg, height: h, opacity: isDisabled ? 0.6 : 1, shadowColor: variant === 'primary' ? t.primary : 'transparent' },
        variant === 'primary' && styles.btnGlow,
        variant === 'ghost' && { borderWidth: 1, borderColor: t.border }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 14 : 16 }}>{title}</Text>
        </View>
      )}
    </Press>
  );
}

// ---- Input -----------------------------------------------------------------
export function Input({ label, error, hint, style, icon, right, ...props }: TextInputProps & {
  label?: string; error?: string | null; hint?: string; icon?: keyof typeof Ionicons.glyphMap; right?: React.ReactNode;
}) {
  const t = useTheme();
  const [focus, setFocus] = React.useState(false);
  const f = useSharedValue(0);
  React.useEffect(() => { f.value = withTiming(focus ? 1 : 0, { duration: 180 }); }, [focus, f]);
  const glow = useAnimatedStyle(() => ({ opacity: f.value }));
  const borderColor = error ? t.danger : focus ? t.primary : t.border;
  return (
    <View style={{ marginBottom: space.lg }}>
      {label && <Text style={[styles.label, { color: focus ? t.primary : t.textMuted }]}>{label}</Text>}
      <View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.md + 3, margin: -3, borderWidth: 3, borderColor: t.primaryBg }, glow]} />
        <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor }]}>
          {icon && <Ionicons name={icon} size={18} color={focus ? t.primary : t.textFaint} style={{ marginLeft: 14 }} />}
          <TextInput
            placeholderTextColor={t.textFaint}
            {...props}
            onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
            onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
            style={[styles.input, { color: t.text, paddingLeft: icon ? 10 : 14 }, style]}
          />
          {right && <View style={{ marginRight: 8 }}>{right}</View>}
        </View>
      </View>
      {error ? <Animated.Text entering={FadeIn} style={[styles.hint, { color: t.danger }]}>{error}</Animated.Text>
        : hint ? <Text style={[styles.hint, { color: t.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

/** Password input with a show/hide eye. */
export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const t = useTheme();
  const [show, setShow] = React.useState(false);
  return (
    <Input
      {...props}
      icon="lock-closed-outline"
      secureTextEntry={!show}
      right={
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.textFaint} />
        </Pressable>
      }
    />
  );
}

// ---- Misc ------------------------------------------------------------------
export function Pill({ label, tone = 'primary', style, icon }: { label: string; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'; style?: ViewStyle; icon?: keyof typeof Ionicons.glyphMap }) {
  const t = useTheme();
  const bg = tone === 'neutral' ? t.surfaceAlt : t[`${tone}Bg` as const];
  const fg = tone === 'neutral' ? t.textMuted : t[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon && <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} />}
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, tone }: { name: string; size?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const t = useTheme();
  const colors = [t.primary, t.accent, '#A78BFA', '#F472B6', t.success, t.warning];
  const idx = name.split('').reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length;
  const bg = tone ? t[tone] : colors[idx];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name) || '?'}</Text>
    </View>
  );
}

export function Row({ children, style, gap = space.md }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: space.md }} />;
}

export function Stat({ label, value, tone, enter }: { label: string; value: number | string; tone?: 'primary' | 'success' | 'warning' | 'danger'; enter?: number }) {
  const t = useTheme();
  const valueStyle = { color: tone ? t[tone] : t.text, fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 };
  const body = (
    <View style={[styles.stat, { backgroundColor: t.surfaceAlt }]}>
      {typeof value === 'number' ? <CountUp value={value} style={valueStyle} /> : <Text style={valueStyle}>{value}</Text>}
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
  return enter !== undefined ? <Enter index={enter} style={{ flex: 1 }}>{body}</Enter> : body;
}

export function Banner({ message, tone = 'danger', onDismiss }: { message: string | null | undefined; tone?: 'danger' | 'warning' | 'success' | 'primary'; onDismiss?: () => void }) {
  const t = useTheme();
  if (!message) return null;
  const icon = { danger: 'alert-circle', warning: 'warning', success: 'checkmark-circle', primary: 'information-circle' }[tone] as keyof typeof Ionicons.glyphMap;
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} layout={Layout}>
      <Pressable onPress={onDismiss} style={[styles.banner, { backgroundColor: t[`${tone}Bg` as const] }]}>
        <Ionicons name={icon} size={18} color={t[tone]} />
        <Text style={{ color: t[tone], fontWeight: '600', flex: 1 }}>{message}</Text>
        {onDismiss && <Ionicons name="close" size={16} color={t[tone]} />}
      </Pressable>
    </Animated.View>
  );
}

export function Empty({ title, body, icon }: { title: string; body?: string; icon?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.surfaceAlt }]}>{icon}</View>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 16, marginTop: 14 }}>{title}</Text>
      {body && <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{body}</Text>}
    </Animated.View>
  );
}

/** Skeleton rows while a list loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
          <Skeleton width={40} height={40} radius={20} color={t.surfaceAlt} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" height={14} color={t.surfaceAlt} />
            <Skeleton width="35%" height={12} color={t.surfaceAlt} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Progress({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const t = useTheme();
  const w = useSharedValue(0);
  React.useEffect(() => { w.value = withTiming(Math.max(0, Math.min(100, value)), { duration: 700 }); }, [value, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 8, backgroundColor: t[tone], borderRadius: 4 }, a]} />
    </View>
  );
}

export function IconDot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Segmented control with a sliding highlight. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const t = useTheme();
  const [w, setW] = React.useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const x = useSharedValue(0);
  React.useEffect(() => { x.value = withTiming(idx * (w / options.length), { duration: 220 }); }, [idx, w, options.length, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width - 8)} style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, padding: 4, borderRadius: radius.md }}>
      {w > 0 && <Animated.View style={[{ position: 'absolute', top: 4, left: 4, width: w / options.length, height: 36, borderRadius: 10, backgroundColor: t.surface, shadowColor: t.shadow, shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 }, a]} />}
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => { haptic.light(); onChange(o.key); }} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: o.key === value ? t.text : t.textMuted, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg, padding: space.lg, borderWidth: 1, marginBottom: space.md,
    shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  btn: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnGlow: { shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, letterSpacing: 0.2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.md, height: 52 },
  input: { flex: 1, height: 50, fontSize: 16, paddingRight: 14 },
  hint: { marginTop: 6, fontSize: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  stat: { flex: 1, borderRadius: radius.md, padding: 14 },
  banner: { borderRadius: radius.md, padding: 14, marginBottom: space.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
