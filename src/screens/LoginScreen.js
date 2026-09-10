import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography, radius } from '../theme/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, error } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const handleLogin = async () => {
    if (!employeeId || !password) {
      setValidationError('Please enter both your Employee ID/Email and password.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    await login(employeeId.trim(), password);
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoWrap}>
        <Image 
          source={require('../../assets/adaptive-icon.png')} 
          style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16, borderWidth: 2, borderColor: '#ccc' }} 
        />
        <Text style={typography.h1}>InnoSet</Text>
        <Text style={styles.subtitle}>Service Engineer TA/DA Management</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Employee ID / Email</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. EMP1024 or you@company.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          value={employeeId}
          onChangeText={setEmployeeId}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {(validationError || error) ? (
          <Text style={styles.errorText}>{validationError || error}</Text>
        ) : null}

        <AppButton title="Log In" onPress={handleLogin} loading={submitting} style={{ marginTop: spacing.md }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: { color: colors.white, fontSize: 24, fontWeight: '700' },
  subtitle: { ...typography.caption, marginTop: 4 },
  form: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  label: { ...typography.h3, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  errorText: { color: colors.danger, marginTop: spacing.sm },
});