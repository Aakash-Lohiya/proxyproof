import React, { useEffect } from 'react';
import { ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

/** Tab icon that switches to its filled glyph and springs up when focused. */
export function TabIcon({ name, focused, color, size }: { name: string; focused: boolean; color: ColorValue; size: number }) {
  const s = useSharedValue(focused ? 1 : 0);
  useEffect(() => { s.value = withSpring(focused ? 1 : 0, { damping: 12, stiffness: 180 }); }, [focused, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 + s.value * 0.15 }, { translateY: -s.value * 2 }] }));
  const glyph = (focused ? name : `${name}-outline`) as keyof typeof Ionicons.glyphMap;
  return (
    <Animated.View style={a}>
      <Ionicons name={glyph} size={size} color={color} />
    </Animated.View>
  );
}
