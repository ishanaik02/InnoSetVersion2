import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import { getTrips, getTripById, deleteTrip } from '../services/tripService';
import { useTrip } from '../context/TripContext';
import { RESUMABLE_STATUSES, DELETABLE_STATUSES } from '../utils/tripStage';
import { colors, spacing, typography, radius } from '../theme/theme';

const STATUS_COLORS = {
  submitted: colors.success,
  approved: colors.success,
  rejected: colors.danger,
  completed: colors.warning,
  in_progress: colors.primary,
  at_site: colors.primary,
  returning: colors.primary,
  draft: colors.textMuted,
};

// What each unsubmitted status actually means to the engineer, since "draft"
// and "in_progress" aren't self-explanatory on their own.
function unsubmittedHint(status) {
  if (status === 'draft') return 'Not started yet — tap to begin or delete it.';
  if (status === 'completed') return 'Tracking done — tap to review and submit for reimbursement.';
  return 'Trip in progress — tap to continue.';
}

export default function PastTripsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { updateTrip: hydrateActiveTrip } = useTrip();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTrips();
      setTrips(data.trips || data || []);
    } catch (e) {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Not-yet-submitted trips aren't a dead end anymore — reopening one
  // rehydrates the in-memory trip context from the server record and drops
  // the engineer back into whichever screen makes sense for how far it got.
  const handleOpenTrip = async (item) => {
    if (!RESUMABLE_STATUSES.includes(item.status) && item.status !== 'completed') {
      navigation.navigate('EngineerTripDetail', { tripId: item._id });
      return;
    }
    setBusyId(item._id);
    try {
      const data = await getTripById(item._id);
      const trip = data.trip || data;
      hydrateActiveTrip({ ...trip, id: trip._id });
      if (trip.status === 'completed') {
        navigation.navigate('TripSummary');
      } else {
        navigation.navigate(trip.tripType === 'round' ? 'RoundTrip' : 'StayTrip');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open this trip. Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteTrip = (item) => {
    Alert.alert(
      'Delete this trip?',
      'This removes the trip and any recorded route or receipts. This can\u2019t be undone.',
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>No trips yet. Start your first trip from the dashboard.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={trips}
      keyExtractor={(item, i) => item._id || String(i)}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
      renderItem={({ item }) => {
        const isUnsubmitted = DELETABLE_STATUSES.includes(item.status);
        const busy = busyId === item._id;
        return (
          <Pressable onPress={() => handleOpenTrip(item)} disabled={busy}>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={typography.h3}>{item.destination}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] || colors.textMuted }]}>
                  <Text style={styles.badgeText}>{(item.status || 'draft').replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={typography.caption}>{new Date(item.date).toDateString()}</Text>
              <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                <Text style={typography.body}>
                  {((item.outboundDistanceKm || 0) + (item.returnDistanceKm || 0)).toFixed(1)} km · {item.conveyance}
                </Text>
                <Text style={styles.amount}>
                  ₹{(item.approvedAmount ?? item.grandTotal ?? item.taDaAmount ?? 0).toFixed(2)}
                </Text>
              </View>
              {!!item.adminReview?.remarks && (
                <View style={styles.reviewNote}>
                  <Text style={styles.reviewLabel}>Reason</Text>
                  <Text style={typography.caption}>{item.adminReview.remarks}</Text>
                </View>
              )}
              {isUnsubmitted ? (
                <View style={styles.unsubmittedRow}>
                  <Text style={styles.detailsLink}>{busy ? 'Working…' : unsubmittedHint(item.status)}</Text>
                  <Pressable
                    onPress={() => handleDeleteTrip(item)}
                    disabled={busy}
                    hitSlop={8}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.detailsLink}>Tap to view details</Text>
              )}
            </Card>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  amount: { fontWeight: '700', color: colors.primary },
  reviewNote: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reviewLabel: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  detailsLink: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: spacing.sm, flexShrink: 1, paddingRight: spacing.sm },
  unsubmittedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  deleteButton: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger },
  deleteButtonText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
