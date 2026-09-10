import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getBills, markBillPaid } from '../services/billService';

export default function AccountDeptDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('approved'); // 'approved' (ready to pay) or 'paid'
  const [searchQuery, setSearchQuery] = useState('');

  // Payment modal
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [paying, setPaying] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      // Get all approved and paid bills
      const data = await getBills({ limit: 100 });
      setBills(data.bills || []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load bills.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const approvedBills = bills.filter(b => b.status === 'approved');
  const paidBills = bills.filter(b => b.status === 'paid');

  const pendingPayoutTotal = approvedBills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const paidTotal = paidBills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);

  const displayedBills = (activeTab === 'approved' ? approvedBills : paidBills).filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.billNumber?.toLowerCase()?.includes(q) ||
      b.employee?.name?.toLowerCase()?.includes(q) ||
      b.branch?.name?.toLowerCase()?.includes(q)
    );
  });

  const handleOpenPayModal = (bill) => {
    setSelectedBill(bill);
    setPaymentRef('');
    setPayModalVisible(true);
  };

  const handleConfirmPay = async () => {
    if (!paymentRef.trim()) {
      Alert.alert('Required', 'Please enter payment reference / UTR / Cheque number.');
      return;
    }
    setPaying(true);
    try {
      await markBillPaid(selectedBill._id, `Paid via ref: ${paymentRef.trim()}`);
      Alert.alert('Success', `Bill ${selectedBill.billNumber} marked as paid.`);
      setPayModalVisible(false);
      fetchBills();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to update payment status.');
    } finally {
      setPaying(false);
    }
  };

  const renderBillItem = ({ item }) => {
    const isApproved = item.status === 'approved';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.billNumber}>{item.billNumber}</Text>
            <Text style={styles.empName}>
              {item.employee?.name} ({item.employee?.employeeId})
            </Text>
            <Text style={styles.branchName}>{item.branch?.name} • {item.branch?.city}</Text>
          </View>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Payable</Text>
            <Text style={styles.amountValue}>₹{(item.totalAmount || 0).toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {item.trip && (
          <View style={styles.routeBox}>
            <Text style={styles.routeText} numberOfLines={1}>
              🚗 {item.trip.startLocation} → {item.trip.destination}
            </Text>
          </View>
        )}

        {/* Breakdown row */}
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownText}>Conveyance: ₹{item.conveyanceAmount || 0}</Text>
          <Text style={styles.breakdownText}>DA: ₹{item.dailyAllowanceAmount || 0}</Text>
          <Text style={styles.breakdownText}>Stay: ₹{item.stayAllowanceAmount || 0}</Text>
        </View>

        <View style={styles.footerRow}>
          <View style={[styles.statusBadge, { backgroundColor: isApproved ? colors.warning + '20' : colors.success + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: isApproved ? colors.warning : colors.success }]}>
              {isApproved ? 'READY FOR PAYOUT' : 'PAID'}
            </Text>
          </View>

          {isApproved ? (
            <TouchableOpacity style={styles.payBtn} onPress={() => handleOpenPayModal(item)}>
              <Text style={styles.payBtnText}>💰 Mark Paid</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.detailBtn}
              onPress={() => navigation.navigate('BillDetail', { id: item._id })}
            >
              <Text style={styles.detailBtnText}>View Details</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.roleLabel}>Accounts Department</Text>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.branchText}>
            📍 {user?.branch?.name ? `${user.branch.name} (${user.branch.code || ''})` : 'Enterprise Finance HQ'}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.statsContainer}>
        <View style={[styles.statBox, { borderLeftColor: colors.warning }]}>
          <Text style={styles.statBoxLabel}>Pending Payout</Text>
          <Text style={[styles.statBoxValue, { color: colors.warning }]}>
            ₹{pendingPayoutTotal.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.statBoxSub}>{approvedBills.length} approved bills</Text>
        </View>
        <View style={[styles.statBox, { borderLeftColor: colors.success }]}>
          <Text style={styles.statBoxLabel}>Total Settled</Text>
          <Text style={[styles.statBoxValue, { color: colors.success }]}>
            ₹{paidTotal.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.statBoxSub}>{paidBills.length} bills disbursed</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Bill #, Engineer or Branch..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'approved' && styles.activeTab]}
          onPress={() => setActiveTab('approved')}
        >
          <Text style={[styles.tabText, activeTab === 'approved' && styles.activeTabText]}>
            Ready to Disburse ({approvedBills.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'paid' && styles.activeTab]}
          onPress={() => setActiveTab('paid')}
        >
          <Text style={[styles.tabText, activeTab === 'paid' && styles.activeTabText]}>
            Disbursed History ({paidBills.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bills List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={displayedBills}
          keyExtractor={(item) => item._id}
          renderItem={renderBillItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBills(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'approved' ? 'No bills pending disbursement.' : 'No disbursed bills found.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Pay Modal */}
      <Modal visible={payModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Disbursement</Text>
            <Text style={styles.modalSub}>
              Bill #{selectedBill?.billNumber} — ₹{(selectedBill?.totalAmount || 0).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.modalEmp}>Beneficiary: {selectedBill?.employee?.name}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Payment Ref / UTR / Bank Trx ID *"
              placeholderTextColor={colors.textMuted}
              value={paymentRef}
              onChangeText={setPaymentRef}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setPayModalVisible(false)}
                disabled={paying}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleConfirmPay}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm Payout</Text>
                )}
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

  header: {
    backgroundColor: '#1B4965',
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  userName: { color: colors.white, fontSize: 18, fontWeight: '700' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  logoutText: { color: colors.white, fontSize: 12, fontWeight: '600' },

  statsContainer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  statBox: {
    flex: 1,
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
  statBoxLabel: { fontSize: 11, color: colors.textMuted },
  statBoxValue: { fontSize: 18, fontWeight: '800', marginVertical: 2 },
  statBoxSub: { fontSize: 11, color: colors.textMuted },

  searchBar: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13,
  },

  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.md, marginVertical: spacing.xs, gap: spacing.xs },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.card },
  activeTab: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  activeTabText: { color: colors.white },

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
  billNumber: { fontSize: 14, fontWeight: '800', color: colors.text },
  empName: { fontSize: 13, color: colors.text, fontWeight: '600', marginTop: 2 },
  branchName: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  amountContainer: { alignItems: 'flex-end' },
  amountLabel: { fontSize: 10, color: colors.textMuted },
  amountValue: { fontSize: 17, fontWeight: '800', color: colors.success },

  routeBox: { backgroundColor: colors.background, padding: spacing.xs, borderRadius: radius.xs, marginTop: spacing.xs },
  routeText: { fontSize: 12, color: colors.textMuted },

  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  breakdownText: { fontSize: 11, color: colors.textMuted },

  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.xs },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  payBtn: { backgroundColor: colors.success, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm },
  payBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  detailBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  detailBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg },
  modalBox: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  modalSub: { fontSize: 14, fontWeight: '600', color: colors.primary, marginBottom: 2 },
  modalEmp: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modalConfirmBtn: { backgroundColor: colors.success },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalConfirmText: { color: colors.white, fontWeight: '700' },
});
