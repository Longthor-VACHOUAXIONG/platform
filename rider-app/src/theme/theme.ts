// Central theme file — swap these to re-brand the entire app.
export const colors = {
  primary: '#B6F400',       // brand lime/green (swap for your brand color)
  primaryDark: '#8FC400',
  black: '#111111',
  white: '#FFFFFF',
  gray50: '#F7F7F8',
  gray100: '#F0F0F1',
  gray200: '#E4E4E6',
  gray400: '#A0A0A6',
  gray600: '#6B6B70',
  gray800: '#2B2B2E',
  danger: '#E5484D',
  dangerBg: '#FBE4E4',
  success: '#1E9E4B',
  overlay: 'rgba(0,0,0,0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '700' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};

// App identity — replace with your own brand name/logo asset
export const brand = {
  name: 'GoFair', // placeholder name, not inDrive
  tagline: 'Your app for fair rides',
};
