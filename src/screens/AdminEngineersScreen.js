import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import { getEngineers, resetEngineerPassword } from '../services/adminService';
import { colors, spacing, typography, radius } from '../theme/theme';

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminEngineersScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState(null); // engineer being reset, or null
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const openReset = (engineer) => {
    setResetTarget(engineer);
    setNewPassword(generateTempPassword());
  };

  const closeReset = () => {
    setResetTarget(null);
    setNewPassword('');
  };

  const submitReset = async () => {
    if (newPassword.trim().length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setResetting(true);
    try {
      await resetEngineerPassword(resetTarget.id, newPassword.trim());
      const employeeId = resetTarget.employeeId;
      const name = resetTarget.name;
      closeReset();
      Alert.alert(
        'Password reset',
        `Share these sign-in details with ${name}:\n\nEmployee ID: ${employeeId}\nNew password: ${newPassword.trim()}`
      );
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not reset password.');
    } finally {
      setResetting(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          const data = await getEngineers();
          if (active) setEngineers(data.engineers || []);
        } catch (e) {
          if (active) setEngineers([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const resetModal = (
    <Modal visible={!!resetTarget} transparent animationType="fade" onRequestClose={closeReset}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={typography.h2}>Reset Password</Text>
          <Text style={[typography.caption, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
            Set a new password for {resetTarget?.name}. Share it with them directly — there's no
            self-service reset in the app.
          </Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
          />
          <AppButton title="Save New Password" onPress={submitReset} loading={resetting} />
          <AppButton title="Cancel" variant="outline" onPress={closeReset} disabled={resetting} />
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (engineers.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>No engineers registered yet.</Text>
        <AppButton
          title="+ Add Engineer"
          onPress={() => navigation.navigate('AdminAddEngineer')}
          style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
        />
        {resetModal}
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={styles.container}
      data={engineers}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
      ListHeaderComponent={
        <AppButton
          title="+ Add Engineer"
          onPress={() => navigation.navigate('AdminAddEngineer')}
          style={{ marginBottom: spacing.md }}
        />
      }
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => navigation.navigate('AdminTrips', { engineerId: item.id })}>
          <Card>
            <View style={styles.rowBetween}>
              <Text style={typography.h3}>{item.name}</Text>
              {item.pendingApprovals > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.pendingApprovals} pending</Text>
                </View>
              )}
            </View>
            <Text style={typography.caption}>{item.employeeId} · {item.email}</Text>
            <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
              <Text style={typography.body}>{item.totalTrips} trips · {item.distanceKm} km</Text>
              <Text style={styles.amount}>₹{item.totalReimbursed.toFixed(2)}</Text>
            </View>
            {item.totalReceipts > 0 && (
              <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
                <Text style={typography.caption}>📎 {item.totalReceipts} receipt{item.totalReceipts === 1 ? '' : 's'} uploaded</Text>
                {item.pendingReceipts > 0 && (
                  <Text style={[typography.caption, { color: colors.warning, fontWeight: '700' }]}>
                    {item.pendingReceipts} awaiting review
                  </Text>
                )}
              </View>
            )}
            <View style={styles.resetRow}>
              <Pressable onPress={() => openReset(item)} hitSlop={8} style={styles.resetButton}>
                <Text style={styles.resetButtonText}>Reset Password</Text>
              </Pressable>
            </View>
          </Card>
        </TouchableOpacity>
      )}
    />
    {resetModal}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.warning },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  amount: { fontWeight: '700', color: colors.primary },
  resetRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  resetButton: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  resetButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  dialog: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
});
