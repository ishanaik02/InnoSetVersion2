export const colors = {
  primary: '#0B5FFF',
  primaryDark: '#0842B0',
  primaryLight: '#E8F0FF',
  accent: '#00C2A8',
  background: '#F5F7FB',
  card: '#FFFFFF',
  text: '#1A1D29',
  textMuted: '#6B7280',
  border: '#E5E9F2',
  success: '#1FAA59',
  warning: '#F5A623',
  danger: '#E5484D',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, fontWeight: '400', color: colors.text },
  caption: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
};

export default { colors, spacing, radius, typography };
