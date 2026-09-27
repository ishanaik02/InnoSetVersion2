import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../services/userService';
import { getPendingBills } from '../services/billService';
import { getPendingAttendance, getBranchAttendance } from '../services/attendanceService';

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

export default function HRDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [pendingBillCount, setPendingBillCount] = useState(0);
  const [pendingAttCount, setPendingAttCount] = useState(0);
  const [todayAttendanceSummary, setTodayAttendanceSummary] = useState({ present: 0, leave: 0, onDuty: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [statsData, billData, attData, todayAttData] = await Promise.all([
        getDashboardStats(),
        getPendingBills(),
        getPendingAttendance({ today: 'true' }),
        getBranchAttendance({ date: todayStr }),
      ]);

      setStats(statsData.stats);
      setPendingBillCount(billData.bills?.length || 0);
      setPendingAttCount(attData.count || 0);

      const records = todayAttData.records || [];
      const present = records.filter(r => r.status === 'present').length;
      const leave = records.filter(r => r.status === 'leave').length;
      const onDuty = records.filter(r => r.status === 'on_duty').length;
      const pending = records.filter(r => r.approvalStatus === 'pending').length;
      setTodayAttendanceSummary({ present, leave, onDuty, pending });
    } catch (e) {
      console.warn('HR Dashboard error:', e?.message);
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
          <Text style={styles.greeting}>HR Manager</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.branch}>{user?.branch?.name || 'Branch'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard icon="📋" label="Attendance Pending" value={pendingAttCount} color="#6C63FF" />
        <StatCard icon="🧾" label="Bills Awaiting HR" value={pendingBillCount} color={colors.warning} />
        <StatCard icon="👥" label="Branch Employees" value={stats?.engineers ?? stats?.users ?? '—'} color={colors.primary} />
        <StatCard icon="✅" label="Present Today" value={todayAttendanceSummary.present} color={colors.success} />
      </View>

      {/* Alert Banners */}
      {pendingAttCount > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => navigation.navigate('HRAttendance')}>
          <Text style={styles.alertIcon}>⚡</Text>
          <Text style={styles.alertText}>{pendingAttCount} attendance record(s) pending review</Text>
          <Text style={styles.alertArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingBillCount > 0 && (
        <TouchableOpacity style={[styles.alertBanner, { borderColor: colors.warning, backgroundColor: '#FFFDF0' }]} onPress={() => navigation.navigate('BillApproval')}>
          <Text style={styles.alertIcon}>🧾</Text>
          <Text style={styles.alertText}>{pendingBillCount} TA/DA bill(s) awaiting verification</Text>
          <Text style={styles.alertArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Today's Attendance Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Attendance Overview</Text>
        <View style={styles.attendanceBar}>
          <View style={styles.attStat}>
            <Text style={[styles.attStatNum, { color: colors.success }]}>{todayAttendanceSummary.present}</Text>
            <Text style={styles.attStatLabel}>Present</Text>
          </View>
          <View style={styles.attStat}>
            <Text style={[styles.attStatNum, { color: colors.danger }]}>{todayAttendanceSummary.leave}</Text>
            <Text style={styles.attStatLabel}>Leave</Text>
          </View>
          <View style={styles.attStat}>
            <Text style={[styles.attStatNum, { color: '#6C63FF' }]}>{todayAttendanceSummary.onDuty}</Text>
            <Text style={styles.attStatLabel}>On Duty</Text>
          </View>
          <View style={styles.attStat}>
            <Text style={[styles.attStatNum, { color: colors.warning }]}>{todayAttendanceSummary.pending}</Text>
            <Text style={styles.attStatLabel}>Pending</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.qaGrid}>
          <QuickAction icon="📋" label="Attendance" color="#6C63FF" onPress={() => navigation.navigate('HRAttendance')} />
          <QuickAction icon="🧾" label="Review Bills" color={colors.warning} onPress={() => navigation.navigate('BillApproval')} />
          <QuickAction icon="👥" label="Employees" color={colors.primary} onPress={() => navigation.navigate('UserManagement')} />
          <QuickAction icon="📅" label="My Attendance" color={colors.accent} onPress={() => navigation.navigate('Attendance')} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: '#6C63FF',
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
    borderColor: '#6C63FF',
  },
  alertIcon: { fontSize: 18, marginRight: spacing.sm },
  alertText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 },
  alertArrow: { color: '#6C63FF', fontWeight: '800', fontSize: 18 },

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

  attendanceBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  attStat: { alignItems: 'center' },
  attStatNum: { fontSize: 22, fontWeight: '800' },
  attStatLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '22%',
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
});
