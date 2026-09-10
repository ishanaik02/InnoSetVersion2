import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';

export default function Card({ children, style, ...rest }) {
  return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
    shadowColor: '#0B1030',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
});
