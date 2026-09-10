import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { getBills } from '../services/billService';

const STATUS_CONFIG = {
  draft:           { label: 'Draft',            color: colors.textMuted,  bg: '#F0F0F0' },
  submitted:       { label: 'Submitted',         color: colors.warning,    bg: '#FFF8E8' },
  approved_by_bm:  { label: 'BM Approved',       color: '#6C63FF',         bg: '#F0EEFF' },
  approved_by_hr:  { label: 'HR Approved',       color: colors.primary,    bg: colors.primaryLight },
  approved_by_sh:  { label: 'SH Approved',       color: '#00A878',         bg: '#E6FAF5' },
  approved:        { label: 'Approved',           color: colors.success,    bg: '#E8F9F0' },
  rejected:        { label: 'Rejected',           color: colors.danger,     bg: '#FEF0F0' },
  paid:            { label: 'Paid ✓',             color: '#1A7A4A',         bg: '#D4F5E5' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: colors.textMuted, bg: '#F0F0F0' };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function BillCard({ bill, onPress }) {
  const date = bill.billDate
    ? new Date(bill.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text style={styles.billNumber}>{bill.billNumber}</Text>
        <StatusBadge status={bill.status} />
      </View>
      {bill.trip && (
        <Text style={styles.tripRoute} numberOfLines={1}>
          {bill.trip.startLocation} → {bill.trip.destination}
        </Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>₹{(bill.totalAmount || 0).toLocaleString('en-IN')}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function BillsScreen({ navigation }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      const data = await getBills();
      setBills(data.bills || []);
    } catch (e) {
      console.warn('Failed to load bills:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={bills}
        keyExtractor={item => item._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBills(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No Bills Yet</Text>
            <Text style={styles.emptySubtitle}>Raise a TA/DA bill from a completed trip.</Text>
          </View>
        }
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        renderItem={({ item }) => (
          <BillCard
            bill={item}
            onPress={() => navigation.navigate('BillDetail', { billId: item._id })}
          />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewBill')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ New Bill</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  billNumber: { fontWeight: '700', fontSize: 14, color: colors.text },
  tripRoute: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: colors.primary },
  date: { color: colors.textMuted, fontSize: 12 },

  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { ...typography.h2, marginBottom: spacing.xs },
  emptySubtitle: { color: colors.textMuted, textAlign: 'center' },

  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
