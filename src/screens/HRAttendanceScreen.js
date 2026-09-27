import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import {
  getBranchAttendance, getAllAttendance, getPendingAttendance,
  approveAttendance, rejectAttendance, bulkApproveAttendance,
} from '../services/attendanceService';

const STATUS_COLORS = {
  present: colors.success,
  leave: colors.danger,
  on_duty: '#6C63FF',
  half_day: colors.warning,
  absent: colors.danger,
};

export default function HRAttendanceScreen({ navigation }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, present, leave, on_duty
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [actioningId, setActioningId] = useState(null);

  // Reject modal state
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [recordToReject, setRecordToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const isCrossBranch = ['service_head', 'super_admin'].includes(user?.role);

  const fetchAttendance = useCallback(async () => {
    try {
      let data;
      const params = { date: selectedDate };
      if (isCrossBranch) {
        data = await getAllAttendance(params);
      } else {
        data = await getBranchAttendance(params);
      }
      setRecords(data.records || []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load attendance records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, isCrossBranch]);

  useEffect(() => {
    setLoading(true);
    fetchAttendance();
  }, [fetchAttendance]);

  const handleApprove = async (item) => {
    setActioningId(item._id);
    try {
      await approveAttendance(item._id);
      Alert.alert('Success', `Attendance for ${item.employee?.name} approved.`);
      fetchAttendance();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to approve attendance.');
    } finally {
      setActioningId(null);
    }
  };

  const handleRejectPrompt = (item) => {
    setRecordToReject(item);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a rejection reason.');
      return;
    }
    const id = recordToReject?._id;
    setRejectModalVisible(false);
    setActioningId(id);
    try {
      await rejectAttendance(id, rejectReason.trim());
      Alert.alert('Success', 'Attendance record rejected.');
      fetchAttendance();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to reject attendance.');
    } finally {
      setActioningId(null);
      setRecordToReject(null);
    }
  };

  const handleBulkApprove = () => {
    const pendingList = records.filter(r => r.approvalStatus === 'pending');
    if (pendingList.length === 0) {
      Alert.alert('Info', 'No pending records to approve for this date.');
      return;
    }

    Alert.alert(
      'Bulk Approve',
      `Approve all ${pendingList.length} pending attendance records for ${selectedDate}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            setLoading(true);
            try {
              const ids = pendingList.map(r => r._id);
              await bulkApproveAttendance({ ids });
              Alert.alert('Success', `Approved ${ids.length} records.`);
              fetchAttendance();
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Bulk approval failed.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const filteredRecords = records.filter(r => {
    if (filter === 'pending') return r.approvalStatus === 'pending';
    if (filter === 'present') return r.status === 'present';
    if (filter === 'leave') return r.status === 'leave';
    if (filter === 'on_duty') return r.status === 'on_duty';
    return true;
  });

  const pendingCount = records.filter(r => r.approvalStatus === 'pending').length;

  const renderItem = ({ item }) => {
    const isPending = item.approvalStatus === 'pending';
    const isActioning = actioningId === item._id;
    const statusColor = STATUS_COLORS[item.status] || colors.textMuted;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{item.employee?.name || 'Unknown'}</Text>
            <Text style={styles.empMeta}>
              ID: {item.employee?.employeeId || '—'} {item.branch?.name ? `• ${item.branch.name}` : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {item.status?.toUpperCase()?.replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Details based on status */}
        {item.status === 'present' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>
              🕒 Marked at: {item.markedAt ? new Date(item.markedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </Text>
            {!item.markedBeforeCutoff && <Text style={styles.lateWarning}>⚠️ Marked after 9:30 AM cutoff</Text>}
          </View>
        )}

        {item.status === 'leave' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>🏖️ Leave Type: {item.leaveType?.toUpperCase() || '—'}</Text>
            {item.leaveReason ? <Text style={styles.detailSub}>Reason: {item.leaveReason}</Text> : null}
          </View>
        )}

        {item.status === 'on_duty' && (
          <View style={styles.detailBox}>
            <Text style={styles.detailText}>📍 Location: {item.onDutyLocation || '—'}</Text>
            {item.onDutyPurpose ? <Text style={styles.detailSub}>Purpose: {item.onDutyPurpose}</Text> : null}
          </View>
        )}

        {/* Approval status banner */}
        <View style={styles.approvalStatusRow}>
          <Text style={styles.approvalStatusLabel}>
            Status: <Text style={{ fontWeight: '700', color: isPending ? colors.warning : item.approvalStatus === 'approved' ? colors.success : colors.danger }}>
              {item.approvalStatus?.toUpperCase()}
            </Text>
          </Text>
          {item.approvedBy?.name && (
            <Text style={styles.approvedByText}>By {item.approvedBy.name}</Text>
          )}
        </View>

        {/* Action buttons if pending */}
        {isPending && (
          <View style={styles.actionRow}>
            {isActioning ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.btn, styles.approveBtn]}
                  onPress={() => handleApprove(item)}
                >
                  <Text style={styles.btnTextApprove}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.rejectBtn]}
                  onPress={() => handleRejectPrompt(item)}
                >
                  <Text style={styles.btnTextReject}>Reject</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Date Navigator */}
      <View style={styles.dateBar}>
        <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateArrow}>
          <Text style={styles.dateArrowText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
          <Text style={styles.dateTitle}>
            {selectedDate === new Date().toISOString().split('T')[0] ? 'Today (' + selectedDate + ')' : selectedDate}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDate(1)} style={styles.dateArrow}>
          <Text style={styles.dateArrowText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Bulk action header if pending exists */}
      {pendingCount > 0 && (
        <View style={styles.bulkBanner}>
          <Text style={styles.bulkBannerText}>{pendingCount} pending review</Text>
          <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkApprove}>
            <Text style={styles.bulkBtnText}>Approve All ({pendingCount})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {['all', 'pending', 'present', 'leave', 'on_duty'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'on_duty' ? 'On Duty' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAttendance(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No attendance records found for this date.</Text>
            </View>
          }
        />
      )}

      {/* Rejection Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reject Attendance</Text>
            <Text style={styles.modalSubtitle}>
              Employee: {recordToReject?.employee?.name}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for rejection (required)..."
              placeholderTextColor={colors.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleConfirmReject}
              >
                <Text style={styles.modalConfirmText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xl },

  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateArrow: { padding: spacing.sm },
  dateArrowText: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  dateTitle: { fontSize: 15, fontWeight: '700', color: colors.text },

  bulkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8E8',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
  },
  bulkBannerText: { fontSize: 13, fontWeight: '600', color: colors.text },
  bulkBtn: { backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  bulkBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: colors.white },

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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  empName: { fontSize: 15, fontWeight: '700', color: colors.text },
  empMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.xs },
  badgeText: { fontSize: 11, fontWeight: '700' },

  detailBox: { backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  detailText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  detailSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lateWarning: { fontSize: 12, color: colors.warning, marginTop: 3, fontWeight: '600' },

  approvalStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  approvalStatusLabel: { fontSize: 12, color: colors.textMuted },
  approvedByText: { fontSize: 11, color: colors.textMuted },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  btn: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  approveBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.danger },
  btnTextApprove: { color: colors.white, fontWeight: '700', fontSize: 13 },
  btnTextReject: { color: colors.white, fontWeight: '700', fontSize: 13 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg },
  modalBox: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    textAlignVertical: 'top',
    fontSize: 14,
    minHeight: 70,
    marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modalConfirmBtn: { backgroundColor: colors.danger },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalConfirmText: { color: colors.white, fontWeight: '700' },
});
