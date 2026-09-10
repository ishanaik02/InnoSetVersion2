import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats, getUsers } from '../services/userService';
import { getBranches } from '../services/branchService';
import { getBills } from '../services/billService';

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

export default function SuperAdminDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [billStats, setBillStats] = useState({ total: 0, pending: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, branchData, usersData, billsData] = await Promise.all([
        getDashboardStats(),
        getBranches(),
        getUsers({ limit: 1 }),
        getBills({ limit: 100 }),
      ]);

      setStats(statsData.stats);
      setBranches(branchData.branches || []);
      setUserCount(usersData.total ?? usersData.users?.length ?? 0);

      const bills = billsData.bills || [];
      const pending = bills.filter(b => !['paid', 'rejected'].includes(b.status)).length;
      const paid = bills.filter(b => b.status === 'paid').length;
      setBillStats({ total: bills.length, pending, paid });
    } catch (e) {
      console.warn('Super Admin Dashboard error:', e?.message);
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
          <Text style={styles.greeting}>Super Administrator</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.branch}>Enterprise HQ — All Branches</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard icon="🏢" label="Total Branches" value={branches.length || 5} color={colors.primary} />
        <StatCard icon="👥" label="Total Staff" value={userCount} color="#6C63FF" />
        <StatCard icon="🚗" label="Trips This Month" value={stats?.tripsThisMonth ?? '—'} color={colors.accent} />
        <StatCard icon="🧾" label="Active Bills" value={billStats.pending} color={colors.warning} />
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Management</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="👥" label="Staff & Roles" color={colors.primary} onPress={() => navigation.navigate('UserManagement')} />
          <QuickAction icon="🚗" label="All Trips" color={colors.accent} onPress={() => navigation.navigate('AdminTrips')} />
          <QuickAction icon="🧾" label="All Bills" color={colors.warning} onPress={() => navigation.navigate('BillApproval')} />
          <QuickAction icon="📋" label="Attendance" color="#6C63FF" onPress={() => navigation.navigate('HRAttendance')} />
          <QuickAction icon="📅" label="My Attendance" color={colors.textMuted} onPress={() => navigation.navigate('Attendance')} />
        </View>
      </View>

      {/* Financial Overview */}
      {stats?.totalApprovedAmount != null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enterprise Financials</Text>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Total Approved Disbursements</Text>
            <Text style={styles.finValue}>₹{Number(stats.totalApprovedAmount).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.finLabel}>Settled Bills</Text>
            <Text style={styles.finValue}>{billStats.paid} bills paid</Text>
          </View>
        </View>
      )}

      {/* Dealership Branches Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Branches ({branches.length})</Text>
        {branches.map((b) => (
          <View key={b._id} style={styles.branchCard}>
            <View style={styles.branchHeader}>
              <Text style={styles.branchName}>{b.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: b.isActive ? colors.success + '20' : colors.danger + '20' }]}>
                <Text style={[styles.statusBadgeText, { color: b.isActive ? colors.success : colors.danger }]}>
                  {b.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            <Text style={styles.branchCity}>📍 {b.city} • Code: {b.code}</Text>
            {b.address ? <Text style={styles.branchAddr}>{b.address}</Text> : null}
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
    backgroundColor: '#1E293B',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  name: { color: colors.white, fontSize: 20, fontWeight: '800' },
  branch: { color: colors.warning, fontSize: 13, marginTop: 2, fontWeight: '600' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
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

  branchCard: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  branchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  branchName: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  branchCity: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  branchAddr: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
