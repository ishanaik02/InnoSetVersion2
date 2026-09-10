import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export default function StatBox({ label, value, icon }) {
  return (
    <View style={styles.box}>
      {icon}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  value: { ...typography.h2, marginTop: spacing.xs },
  label: { ...typography.caption, marginTop: 2, textAlign: 'center' },
});
