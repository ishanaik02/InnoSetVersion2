import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../services/userService';
import { getPendingBills } from '../services/billService';
import { getBranches } from '../services/branchService';

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

export default function ServiceHeadDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [pendingBillCount, setPendingBillCount] = useState(0);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, billData, branchData] = await Promise.all([
        getDashboardStats(),
        getPendingBills(),
        getBranches(),
      ]);

      setStats(statsData.stats);
      setPendingBillCount(billData.bills?.length || 0);
      setBranches(branchData.branches || []);
    } catch (e) {
      console.warn('Service Head Dashboard error:', e?.message);
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
          <Text style={styles.greeting}>Service Head (Cross-Branch)</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.branch}>All Dealership Branches</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard icon="⚡" label="Pending Final Approval" value={pendingBillCount} color={colors.warning} />
        <StatCard icon="🚗" label="Trips This Month" value={stats?.tripsThisMonth ?? '—'} color={colors.primary} />
        <StatCard icon="👥" label="Total Engineers" value={stats?.engineers ?? stats?.totalEngineers ?? '—'} color={colors.accent} />
        <StatCard icon="🏢" label="Active Branches" value={branches.length || 5} color={colors.success} />
      </View>

      {/* Alert Banner */}
      {pendingBillCount > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('BillApproval')}>
          <Text style={styles.alertIcon}>⚡</Text>
          <Text style={styles.alertText}>{pendingBillCount} bill(s) awaiting your final sanction / amount adjustment</Text>
          <Text style={styles.alertArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="🧾" label="Approve Bills" color={colors.warning} onPress={() => navigation.navigate('BillApproval')} />
          <QuickAction icon="🚗" label="All Trips" color={colors.primary} onPress={() => navigation.navigate('AllTrips')} />
          <QuickAction icon="📋" label="Attendance" color="#6C63FF" onPress={() => navigation.navigate('AllAttendance')} />
          <QuickAction icon="👥" label="Staff" color={colors.success} onPress={() => navigation.navigate('UserManagement')} />
          <QuickAction icon="📅" label="My Attendance" color={colors.textMuted} onPress={() => navigation.navigate('Attendance')} />
        </View>
      </View>

      {/* Financial Pipeline */}
      {stats?.totalApprovedAmount != null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reimbursement Pipeline</Text>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Approved Payouts</Text>
            <Text style={styles.finValue}>₹{Number(stats.totalApprovedAmount).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Total Distance Tracked</Text>
            <Text style={styles.finValue}>{stats.totalDistanceKm ?? 0} km</Text>
          </View>
        </View>
      )}

      {/* Branch List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dealership Branches</Text>
        {branches.map((b) => (
          <View key={b._id} style={styles.branchRow}>
            <View>
              <Text style={styles.branchName}>{b.name}</Text>
              <Text style={styles.branchCity}>{b.city} • Code: {b.code}</Text>
            </View>
            <View style={[styles.branchBadge, { backgroundColor: b.isActive ? colors.success + '20' : colors.danger + '20' }]}>
              <Text style={[styles.branchBadgeText, { color: b.isActive ? colors.success : colors.danger }]}>
                {b.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: '#0F4C81',
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
  alertText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 },
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
    width: '18%',
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  qaIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  qaIconText: { fontSize: 22 },
  qaLabel: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center' },

  financialRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  finLabel: { color: colors.textMuted, fontSize: 14 },
  finValue: { color: colors.text, fontWeight: '700', fontSize: 15 },

  branchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  branchName: { fontSize: 15, fontWeight: '700', color: colors.text },
  branchCity: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  branchBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.xs },
  branchBadgeText: { fontSize: 11, fontWeight: '700' },
});
