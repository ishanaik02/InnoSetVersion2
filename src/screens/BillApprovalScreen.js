import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getPendingBills, approveBill, rejectBill } from '../services/billService';

const ROLE_STAGE = {
  branch_manager: 'submitted',
  hr: 'approved_by_bm',
  service_head: 'approved_by_hr',
};

function BillItem({ bill, onApprove, onReject, onPress, role }) {
  const isMyStage = bill.status === ROLE_STAGE[role];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <Text style={styles.billNum}>{bill.billNumber}</Text>
        <Text style={styles.amount}>₹{(bill.totalAmount || 0).toLocaleString('en-IN')}</Text>
      </View>
      <Text style={styles.employee}>{bill.employee?.name} ({bill.employee?.employeeId})</Text>
      {bill.trip && (
        <Text style={styles.route} numberOfLines={1}>
          {bill.trip.startLocation} → {bill.trip.destination}
        </Text>
      )}
      <Text style={styles.date}>
        {bill.billDate ? new Date(bill.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
      </Text>

      {isMyStage && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.approveBtn} onPress={() => onApprove(bill)}>
            <Text style={styles.approveBtnText}>✅ Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => onReject(bill)}>
            <Text style={styles.rejectBtnText}>❌ Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function BillApprovalScreen({ navigation }) {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(null); // billId being actioned

  const fetchBills = useCallback(async () => {
    try {
      const data = await getPendingBills();
      setBills(data.bills || []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load bills.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const handleApprove = (bill) => {
    Alert.alert(
      'Approve Bill',
      `Approve ${bill.billNumber} for ₹${bill.totalAmount?.toLocaleString('en-IN')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActioning(bill._id);
            try {
              await approveBill(bill._id, '');
              Alert.alert('Done', 'Bill approved and forwarded.');
              fetchBills();
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Approval failed.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (bill) => {
    Alert.alert(
      'Reject Bill',
      `Reject ${bill.billNumber}? This will return it to the engineer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActioning(bill._id);
            try {
              await rejectBill(bill._id, 'Rejected by ' + user?.role);
              Alert.alert('Rejected', 'Bill returned to engineer.');
              fetchBills();
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Rejection failed.');
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
  };

  const stageLabel = {
    branch_manager: 'Bills Submitted for Your Review',
    hr: 'Bills Approved by BM — Your Review',
    service_head: 'Bills Approved by HR — Final Approval',
    account_dept: 'Approved Bills — Process Payment',
    super_admin: 'All Pending Bills',
  }[user?.role] || 'Pending Bills';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>{stageLabel}</Text>
        <Text style={styles.countBadge}>{bills.length}</Text>
      </View>

      <FlatList
        data={bills}
        keyExtractor={item => item._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBills(); }} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptySubtitle}>No bills pending your review.</Text>
          </View>
        }
        renderItem={({ item }) => (
          actioning === item._id ? (
            <View style={[styles.card, styles.cardLoading]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <BillItem
              bill={item}
              role={user?.role}
              onApprove={handleApprove}
              onReject={handleReject}
              onPress={() => navigation.navigate('BillDetail', { billId: item._id })}
            />
          )
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerBar: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  list: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  cardLoading: { alignItems: 'center', paddingVertical: spacing.xl },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  billNum: { fontWeight: '700', fontSize: 14, color: colors.text },
  amount: { fontSize: 18, fontWeight: '800', color: colors.primary },
  employee: { color: colors.textMuted, fontSize: 13 },
  route: { color: colors.text, fontSize: 13, marginTop: 2 },
  date: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  approveBtn: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  approveBtnText: { color: colors.white, fontWeight: '700' },
  rejectBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  rejectBtnText: { color: colors.white, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { ...typography.h2, marginBottom: spacing.xs },
  emptySubtitle: { color: colors.textMuted },
});
