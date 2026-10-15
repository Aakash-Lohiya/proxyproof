import { useColorScheme } from 'react-native';

export const palette = {
  blue: '#4F8CFF',
  blueDeep: '#2F6BFF',
  cyan: '#22D3EE',
  mint: '#34D399',
  amber: '#F59E0B',
  rose: '#FB7185',
  violet: '#A78BFA',
};

export type Theme = {
  dark: boolean;
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  successBg: string;
  warningBg: string;
  dangerBg: string;
  primaryBg: string;
  shadow: string;
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#0B1020',
  bgElevated: '#101729',
  surface: '#151D33',
  surfaceAlt: '#1C2640',
  border: '#24304F',
  text: '#F2F5FF',
  textMuted: '#9AA6C7',
  textFaint: '#5F6B8C',
  primary: palette.blue,
  primaryText: '#0B1020',
  accent: palette.cyan,
  success: palette.mint,
  warning: palette.amber,
  danger: palette.rose,
  successBg: 'rgba(52,211,153,0.14)',
  warningBg: 'rgba(245,158,11,0.16)',
  dangerBg: 'rgba(251,113,133,0.16)',
  primaryBg: 'rgba(79,140,255,0.16)',
  shadow: '#000000',
};

export const lightTheme: Theme = {
  dark: false,
  bg: '#F4F6FB',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2FA',
  border: '#E1E6F2',
  text: '#0F1730',
  textMuted: '#5B6785',
  textFaint: '#9AA4BF',
  primary: palette.blueDeep,
  primaryText: '#FFFFFF',
  accent: '#0891B2',
  success: '#059669',
  warning: '#D97706',
  danger: '#E11D48',
  successBg: 'rgba(5,150,105,0.12)',
  warningBg: 'rgba(217,119,6,0.12)',
  dangerBg: 'rgba(225,29,72,0.10)',
  primaryBg: 'rgba(47,107,255,0.10)',
  shadow: '#1B2A55',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const font = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  mono: { fontSize: 14, fontFamily: 'monospace' as const },
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
