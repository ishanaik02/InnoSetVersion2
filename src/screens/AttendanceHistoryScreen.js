import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { getMyAttendance } from '../services/attendanceService';

const STATUS_COLORS = {
  present: colors.success,
  leave: colors.danger,
  on_duty: '#6C63FF',
  half_day: colors.warning,
  absent: colors.danger,
};

const APPROVAL_COLORS = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

export default function AttendanceHistoryScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchRecords = useCallback(async () => {
    try {
      const data = await getMyAttendance();
      setRecords(data.records || []);
    } catch (e) {
      console.warn('Failed to load attendance history:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filtered = records.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const renderItem = ({ item }) => {
    const statusColor = STATUS_COLORS[item.status] || colors.textMuted;
    const approvalColor = APPROVAL_COLORS[item.approvalStatus] || colors.textMuted;
    const dateFormatted = item.date
      ? new Date(item.date).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{dateFormatted}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {item.status?.toUpperCase()?.replace('_', ' ')}
            </Text>
          </View>
        </View>

        {item.status === 'present' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailText}>
              🕒 Marked at: {item.markedAt ? new Date(item.markedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </Text>
            {!item.markedBeforeCutoff && <Text style={styles.lateText}>⚠️ Marked after 9:30 AM cutoff</Text>}
          </View>
        )}

        {item.status === 'leave' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>🏖️ {item.leaveType?.toUpperCase() || 'LEAVE'}</Text>
            {item.leaveReason ? <Text style={styles.detailSub}>Reason: {item.leaveReason}</Text> : null}
          </View>
        )}

        {item.status === 'on_duty' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>📍 {item.onDutyLocation || 'On Duty'}</Text>
            {item.onDutyPurpose ? <Text style={styles.detailSub}>Purpose: {item.onDutyPurpose}</Text> : null}
          </View>
        )}

        <View style={styles.footerRow}>
          <View style={[styles.approvalBadge, { backgroundColor: approvalColor + '20' }]}>
            <Text style={[styles.approvalBadgeText, { color: approvalColor }]}>
              {item.approvalStatus?.toUpperCase()}
            </Text>
          </View>
          {item.approvedBy?.name && (
            <Text style={styles.approverText}>Approved by {item.approvedBy.name}</Text>
          )}
          {item.approvalRemarks && item.approvalStatus === 'rejected' ? (
            <Text style={styles.rejectionText}>Reason: {item.approvalRemarks}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['all', 'present', 'leave', 'on_duty'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'on_duty' ? 'On Duty' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchRecords();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>No attendance records found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xl },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.white },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 15, fontWeight: '700', color: colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.xs },
  badgeText: { fontSize: 11, fontWeight: '700' },

  detailRow: { marginTop: spacing.sm },
  detailBox: { backgroundColor: colors.background, borderRadius: radius.xs, padding: spacing.sm, marginTop: spacing.sm },
  detailText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  detailSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lateText: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 2 },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  approvalBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs },
  approvalBadgeText: { fontSize: 10, fontWeight: '800' },
  approverText: { fontSize: 11, color: colors.textMuted },
  rejectionText: { fontSize: 11, color: colors.danger, fontWeight: '600' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
