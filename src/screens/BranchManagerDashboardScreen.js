import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../services/userService';
import { getPendingBills } from '../services/billService';
import { getPendingAttendance } from '../services/attendanceService';

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color || colors.primary }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, color }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.qaIcon, { backgroundColor: color + '22' }]}>
        <Text style={styles.qaIconText}>{icon}</Text>
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function BranchManagerDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [pendingBillCount, setPendingBillCount] = useState(0);
  const [pendingAttCount, setPendingAttCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, billData, attData] = await Promise.all([
        getDashboardStats(),
        getPendingBills(),
        getPendingAttendance({ today: 'true' }),
      ]);
      setStats(statsData.stats);
      setPendingBillCount(billData.bills?.length || 0);
      setPendingAttCount(attData.count || 0);
    } catch (e) {
      console.warn('BM Dashboard error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Branch Manager</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.branch}>{user?.branch?.name || 'Branch'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard icon="👥" label="Engineers" value={stats?.engineers ?? '—'} color={colors.primary} />
        <StatCard icon="🚗" label="Trips This Month" value={stats?.tripsThisMonth ?? '—'} color={colors.accent} />
        <StatCard icon="🧾" label="Bills Pending My Review" value={stats?.pendingBillsForMyRole ?? '—'} color={colors.warning} />
        <StatCard icon="📋" label="Attendance Pending" value={pendingAttCount} color="#6C63FF" />
      </View>

      {/* Alert banners */}
      {(stats?.pendingBillsForMyRole > 0) && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('BillApproval')}>
          <Text style={styles.alertIcon}>⚡</Text>
          <Text style={styles.alertText}>{stats.pendingBillsForMyRole} bill(s) awaiting your approval</Text>
          <Text style={styles.alertArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="🧾" label="Review Bills" color={colors.warning} onPress={() => navigation.navigate('BillApproval')} />
          <QuickAction icon="🚗" label="Branch Trips" color={colors.primary} onPress={() => navigation.navigate('BranchTrips')} />
          <QuickAction icon="📋" label="Attendance" color="#6C63FF" onPress={() => navigation.navigate('BranchAttendance')} />
          <QuickAction icon="➕" label="Add Engineer" color={colors.success} onPress={() => navigation.navigate('UserManagement')} />
          <QuickAction icon="📊" label="Reports" color={colors.accent} onPress={() => navigation.navigate('BranchAttendance')} />
          <QuickAction icon="📅" label="My Attendance" color={colors.textMuted} onPress={() => navigation.navigate('Attendance')} />
        </View>
      </View>

      {/* Financial Summary */}
      {stats?.totalApprovedAmount != null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Summary</Text>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Total Approved Amount</Text>
            <Text style={styles.finValue}>₹{Number(stats.totalApprovedAmount).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Bills in Pipeline</Text>
            <Text style={styles.finValue}>{stats.pendingBills ?? '—'}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  name: { color: colors.white, fontSize: 20, fontWeight: '800' },
  branch: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  logoutText: { color: colors.white, fontWeight: '600', fontSize: 13 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  alertBanner: {
    backgroundColor: '#FFF8E8',
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  alertIcon: { fontSize: 18, marginRight: spacing.sm },
  alertText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  alertArrow: { color: colors.warning, fontWeight: '800', fontSize: 18 },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },

  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  qaIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  qaIconText: { fontSize: 24 },
  qaLabel: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center' },

  financialRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  finLabel: { color: colors.textMuted, fontSize: 14 },
  finValue: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
