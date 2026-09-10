import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import StatBox from '../components/StatBox';
import AppButton from '../components/AppButton';
import { useAuth } from '../context/AuthContext';
import { getOverview } from '../services/adminService';
import { colors, spacing, typography, radius } from '../theme/theme';

export default function AdminDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    totalEngineers: 0,
    totalTrips: 0,
    tripsThisMonth: 0,
    pendingApprovals: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalDistanceKm: 0,
    pendingReimbursement: 0,
    approvedReimbursement: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getOverview();
      setStats(data);
    } catch (e) {
      // backend not reachable — keep last known values
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You can continue working by choosing Stay.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={typography.caption}>Admin</Text>
          <Text style={typography.h1}>{user?.name || 'Admin'}</Text>
          <Text style={styles.branchBadge}>
            📍 {user?.branch?.name ? `${user.branch.name} (${user.branch.code || ''})` : (user?.branch || 'Indore Branch (BR01)')}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={confirmLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>

      <Card style={styles.pendingCard} onTouchEnd={() => navigation.navigate('AdminTrips', { statusFilter: 'submitted' })}>
        <Text style={styles.pendingLabel}>Pending Approvals</Text>
        <Text style={styles.pendingValue}>{loading ? '—' : stats.pendingApprovals}</Text>
        <Text style={styles.pendingCaption}>Tap to review submitted trip claims</Text>
      </Card>

      <View style={styles.statsRow}>
        <StatBox label="Engineers" value={stats.totalEngineers} />
        <StatBox label="Total Trips" value={stats.totalTrips} />
        <StatBox label="This Month" value={stats.tripsThisMonth} />
      </View>

      <View style={styles.statsRow}>
        <StatBox label="Approved" value={stats.approvedCount} />
        <StatBox label="Rejected" value={stats.rejectedCount} />
        <StatBox label="Distance (km)" value={stats.totalDistanceKm} />
      </View>

      <Card>
        <Text style={typography.h3}>Reimbursements</Text>
        <View style={styles.row}>
          <Text style={typography.body}>Pending</Text>
          <Text style={[styles.amount, { color: colors.warning }]}>₹{Number(stats.pendingReimbursement || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={typography.body}>Approved</Text>
          <Text style={[styles.amount, { color: colors.success }]}>₹{Number(stats.approvedReimbursement || 0).toFixed(2)}</Text>
        </View>
      </Card>

      <AppButton title="Review Trips & Claims" onPress={() => navigation.navigate('AdminTrips')} style={{ marginTop: spacing.sm }} />
      <AppButton title="View Engineers" variant="outline" onPress={() => navigation.navigate('AdminEngineers')} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, marginTop: spacing.sm },
  logoutButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill },
  logoutText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  amount: { fontWeight: '700' },
  pendingCard: { backgroundColor: colors.primary },
  pendingLabel: { color: colors.white, opacity: 0.85, fontSize: 13, fontWeight: '600' },
  pendingValue: { color: colors.white, fontSize: 34, fontWeight: '800', marginVertical: 2 },
  pendingCaption: { color: colors.white, opacity: 0.85, fontSize: 12 },
  branchBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 3,
  },
});
