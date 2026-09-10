import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getTodayAttendance, markAttendance } from '../services/attendanceService';

const STATUS_OPTIONS = [
  { key: 'present', label: 'Present', icon: '✅', color: colors.success },
  { key: 'leave', label: 'Leave', icon: '📋', color: colors.warning },
  { key: 'on_duty', label: 'On Duty', icon: '🚗', color: colors.primary },
];

const LEAVE_TYPES = [
  { key: 'casual', label: 'Casual Leave' },
  { key: 'sick', label: 'Sick Leave' },
  { key: 'earned', label: 'Earned Leave' },
  { key: 'unpaid', label: 'Unpaid Leave' },
  { key: 'other', label: 'Other' },
];

const APPROVAL_COLORS = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

export default function AttendanceScreen({ navigation }) {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState(null);
  const [beforeCutoff, setBeforeCutoff] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [leaveType, setLeaveType] = useState('casual');
  const [leaveReason, setLeaveReason] = useState('');
  const [onDutyLocation, setOnDutyLocation] = useState('');
  const [onDutyPurpose, setOnDutyPurpose] = useState('');

  const fetchToday = useCallback(async () => {
    try {
      const data = await getTodayAttendance();
      setTodayRecord(data.record);
      setBeforeCutoff(data.markedBeforeCutoff);
      if (data.record) setSelectedStatus(data.record.status);
    } catch (e) {
      console.warn('Failed to fetch attendance:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const handleMark = async () => {
    if (!selectedStatus) return Alert.alert('Select Status', 'Please select your attendance status.');
    if (selectedStatus === 'leave' && !leaveType) return Alert.alert('Leave Type', 'Please select leave type.');

    setSubmitting(true);
    try {
      await markAttendance({
        status: selectedStatus,
        leaveType: selectedStatus === 'leave' ? leaveType : undefined,
        leaveReason: selectedStatus === 'leave' ? leaveReason : undefined,
        onDutyLocation: selectedStatus === 'on_duty' ? onDutyLocation : undefined,
        onDutyPurpose: selectedStatus === 'on_duty' ? onDutyPurpose : undefined,
      });
      Alert.alert('Attendance Marked', 'Your attendance has been submitted for HR review.');
      fetchToday();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to mark attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isLocked = todayRecord?.isLocked || todayRecord?.approvalStatus === 'approved';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchToday(); }} />}
    >
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.dateText}>{today}</Text>
        <Text style={styles.subtitle}>Daily Attendance</Text>
        {!beforeCutoff && (
          <View style={styles.cutoffBanner}>
            <Text style={styles.cutoffText}>⚠️ After 09:30 cutoff — submit before tomorrow</Text>
          </View>
        )}
      </View>

      {/* Current Status */}
      {todayRecord && (
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>Today's Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_OPTIONS.find(o => o.key === todayRecord.status)?.color || colors.textMuted }]}>
              <Text style={styles.statusBadgeText}>
                {STATUS_OPTIONS.find(o => o.key === todayRecord.status)?.icon} {todayRecord.status.toUpperCase().replace('_', ' ')}
              </Text>
            </View>
            <View style={[styles.approvalBadge, { borderColor: APPROVAL_COLORS[todayRecord.approvalStatus] }]}>
              <Text style={[styles.approvalText, { color: APPROVAL_COLORS[todayRecord.approvalStatus] }]}>
                {todayRecord.approvalStatus?.toUpperCase()}
              </Text>
            </View>
          </View>
          {todayRecord.approvalRemarks ? (
            <Text style={styles.remarksText}>HR Remark: {todayRecord.approvalRemarks}</Text>
          ) : null}
          {isLocked && <Text style={styles.lockedText}>🔒 Record locked by HR</Text>}
        </View>
      )}

      {/* Mark Attendance Form */}
      {!isLocked && (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            {todayRecord ? 'Update Attendance' : 'Mark Attendance'}
          </Text>

          {/* Status Selector */}
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusOption, selectedStatus === opt.key && { backgroundColor: opt.color, borderColor: opt.color }]}
                onPress={() => setSelectedStatus(opt.key)}
              >
                <Text style={styles.statusIcon}>{opt.icon}</Text>
                <Text style={[styles.statusLabel, selectedStatus === opt.key && { color: colors.white }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Leave sub-form */}
          {selectedStatus === 'leave' && (
            <View style={styles.subForm}>
              <Text style={styles.fieldLabel}>Leave Type</Text>
              {LEAVE_TYPES.map(lt => (
                <TouchableOpacity
                  key={lt.key}
                  style={[styles.radioRow, leaveType === lt.key && styles.radioRowSelected]}
                  onPress={() => setLeaveType(lt.key)}
                >
                  <View style={[styles.radio, leaveType === lt.key && styles.radioFilled]} />
                  <Text style={styles.radioLabel}>{lt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* On Duty sub-form */}
          {selectedStatus === 'on_duty' && (
            <View style={styles.subForm}>
              <Text style={styles.fieldLabel}>Duty Location</Text>
              <View style={styles.inputBox}>
                <Text style={styles.inputPlaceholder}>e.g. Customer site, Bhopal</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleMark}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>
                {todayRecord ? 'Update Attendance' : 'Submit Attendance'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* History link */}
      <TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate('AttendanceHistory')}>
        <Text style={styles.historyLinkText}>📅 View Attendance History</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  cutoffBanner: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  cutoffText: { color: colors.white, fontSize: 12, fontWeight: '600' },

  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusBadgeText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  approvalBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  approvalText: { fontWeight: '700', fontSize: 12 },
  remarksText: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  lockedText: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },

  formCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  statusGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  statusIcon: { fontSize: 24, marginBottom: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600', color: colors.text },

  subForm: { marginBottom: spacing.md },
  fieldLabel: { ...typography.caption, fontWeight: '600', marginBottom: spacing.xs },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  radioRowSelected: { backgroundColor: colors.primaryLight },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: spacing.sm,
  },
  radioFilled: { backgroundColor: colors.primary },
  radioLabel: { fontSize: 14, color: colors.text },

  inputBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputPlaceholder: { color: colors.textMuted, fontSize: 14 },

  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },

  historyLink: {
    alignItems: 'center',
    padding: spacing.md,
  },
  historyLinkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
