import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';

/**
 * Large, touch-friendly button as required by the UI/UX spec.
 * variant: 'primary' | 'secondary' | 'danger' | 'outline'
 */
export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}) {
  const variantStyles = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.accent },
    danger: { backgroundColor: colors.danger },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  };

  const textColor = variant === 'outline' ? colors.primary : colors.white;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        variantStyles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
