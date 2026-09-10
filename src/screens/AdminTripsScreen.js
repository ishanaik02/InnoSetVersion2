import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import { getAllTrips, getReceiptUri, deleteTrip } from '../services/adminService';
import { colors, spacing, typography, radius } from '../theme/theme';

// Only fetch/render a preview for the first few receipts per trip — enough
// for the admin to see documents are attached and spot-check them, without
// the list making dozens of image requests for a heavily-receipted trip.
const MAX_PREVIEWS_PER_TRIP = 3;

const STATUS_COLORS = {
  submitted: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
  completed: colors.primary,
  in_progress: colors.primary,
  draft: colors.textMuted,
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminTripsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState([]);
  const [receiptUris, setReceiptUris] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(route?.params?.statusFilter || '');
  const engineerId = route?.params?.engineerId || '';
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (filter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = {};
      if (filter) params.status = filter;
      if (engineerId) params.engineer = engineerId;
      const data = await getAllTrips(params);
      const trips = data.trips || [];
      setTrips(trips);

      const uris = {};
      for (const trip of trips) {
        for (const r of (trip.receipts || []).slice(0, MAX_PREVIEWS_PER_TRIP)) {
          if (r.contentType?.startsWith('image/')) {
            uris[r._id] = await getReceiptUri(trip._id, r._id);
          }
        }
      }
      setReceiptUris(uris);
    } catch (e) {
      // Surface the real failure instead of showing an empty list that
      // looks identical to "genuinely no trips match" — a failed request
      // and zero results are very different problems for an admin trying
      // to manage reimbursements.
      setTrips([]);
      setLoadError(
        e?.response?.data?.message || e?.message || 'Could not load trips. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [engineerId]);

  useFocusEffect(
    useCallback(() => {
      load(statusFilter);
    }, [statusFilter, load])
  );

  const handleDeleteTrip = (item) => {
    Alert.alert(
      'Delete this trip?',
      `This permanently removes ${item.engineer?.name || 'this'}'s trip record, including any receipts and tracked route. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item._id);
            try {
              await deleteTrip(item._id);
              setTrips((prev) => prev.filter((t) => t._id !== item._id));
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete this trip.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterText, statusFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={[typography.body, { color: colors.danger, textAlign: 'center', marginBottom: spacing.md }]}>
            {loadError}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load(statusFilter)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.center}>
          <Text style={typography.body}>No trips match this filter.</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('AdminTripDetail', { tripId: item._id })}>
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={typography.h3}>{item.engineer?.name || 'Unknown engineer'}</Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] || colors.textMuted }]}>
                    <Text style={styles.badgeText}>{(item.status || 'draft').replace('_', ' ')}</Text>
                  </View>
                </View>
                <Text style={typography.caption}>{item.engineer?.employeeId} · {new Date(item.date).toDateString()}</Text>
                <Text style={[typography.body, { marginTop: spacing.xs }]}>{item.startLocation} → {item.destination}</Text>
                <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                  <Text style={typography.body}>
                    {((item.outboundDistanceKm || 0) + (item.returnDistanceKm || 0)).toFixed(1)} km · {item.conveyance}
                  </Text>
                  <Text style={styles.amount}>
                    ₹{(item.approvedAmount ?? item.grandTotal ?? item.taDaAmount ?? 0).toFixed(2)}
                  </Text>
                </View>
                {['approved', 'rejected'].includes(item.status) && (
                  <View style={styles.reasonRow}>
                    <Text style={styles.reasonLabel}>Reason</Text>
                    <Text style={typography.caption}>{item.adminReview?.remarks || 'No reason provided'}</Text>
                  </View>
                )}
                {item.receipts?.length > 0 && (
                  <View style={styles.receiptsRow}>
                    {item.receipts.slice(0, MAX_PREVIEWS_PER_TRIP).map((r) =>
                      receiptUris[r._id] ? (
                        <Image key={r._id} source={{ uri: receiptUris[r._id] }} style={styles.receiptThumb} />
                      ) : (
                        <View key={r._id} style={styles.pdfChip}>
                          <Text style={styles.pdfChipText}>PDF</Text>
                        </View>
                      )
                    )}
                    <Text style={styles.receiptsCount}>
                      📎 {item.receipts.length} document{item.receipts.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                )}
                {item.status !== 'submitted' && (
                  <View style={styles.deleteRow}>
                    <Pressable
                      onPress={() => handleDeleteTrip(item)}
                      disabled={busyId === item._id}
                      hitSlop={8}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>{busyId === item._id ? 'Deleting…' : 'Delete Trip'}</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  filterTextActive: { color: colors.white },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  amount: { fontWeight: '700', color: colors.primary },
  reasonRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reasonLabel: { ...typography.caption, fontWeight: '700', marginBottom: 2 },
  receiptsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  receiptThumb: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.border, marginRight: spacing.xs },
  pdfChip: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  pdfChipText: { color: colors.primary, fontWeight: '700', fontSize: 9 },
  receiptsCount: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.xs },
  deleteRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  deleteButton: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger },
  deleteButtonText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryButtonText: { color: colors.white, fontWeight: '700' },
});
