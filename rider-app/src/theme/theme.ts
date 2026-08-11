// Central theme file — inDrive-inspired palette. Swap these to re-brand.
export const colors = {
  primary: '#2E5BFF',       // inDrive-style vivid blue
  primaryDark: '#1A3FCC',
  black: '#1C1C28',
  white: '#FFFFFF',
  gray50: '#F4F6FA',        // app background
  gray100: '#EEF0F5',
  gray200: '#E2E2EA',
  gray400: '#92929D',
  gray600: '#5E5E66',
  gray800: '#2B2B3A',
  danger: '#FC5A5A',
  dangerBg: '#FDEBEB',
  success: '#1BC06E',
  overlay: 'rgba(28,28,40,0.45)',
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
    shadowColor: '#1C1C28',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
};

// App identity — replace with your own brand name/logo asset
export const brand = {
  name: 'GoFair', // placeholder name, not inDrive
  tagline: 'Your app for fair rides',
};
