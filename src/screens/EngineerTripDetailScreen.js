import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import OpenStreetMap from '../components/OpenStreetMap';
import { getTripById } from '../services/tripService';
import { colors, radius, spacing, typography } from '../theme/theme';

const STATUS_COLORS = {
  submitted: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
  completed: colors.primary,
  in_progress: colors.primary,
  draft: colors.textMuted,
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EngineerTripDetailScreen({ route }) {
  const insets = useSafeAreaInsets();
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          const data = await getTripById(tripId);
          if (active) setTrip(data.trip || data);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [tripId])
  );

  if (loading || !trip) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const trackedDistance = (trip.outboundDistanceKm || 0) + (trip.returnDistanceKm || 0);
  const claimedDistance = trackedDistance + (trip.additionalKm || 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={typography.h2}>{trip.destination}</Text>
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[trip.status] || colors.textMuted }]}>
            <Text style={styles.badgeText}>{(trip.status || 'draft').replace('_', ' ')}</Text>
          </View>
        </View>
        <Row label="Date" value={trip.date ? new Date(trip.date).toDateString() : '—'} />
        <Row label="Start" value={trip.startLocation} />
        <Row label="Conveyance" value={trip.conveyance} />
        <Row label="Outbound Distance" value={`${(trip.outboundDistanceKm || 0).toFixed(1)} km`} />
        <Row label="Return Distance" value={`${(trip.returnDistanceKm || 0).toFixed(1)} km`} />
        <Row label="Total Claimed Distance" value={`${claimedDistance.toFixed(1)} km`} bold />
      </Card>

      {(trip.startTime || trip.endTime) && (
        <Card>
          <Text style={typography.h3}>Trip Timing</Text>
          <Row label="Started" value={formatDateTime(trip.startTime)} />
          {trip.siteReachedTime && <Row label="Reached Site" value={formatDateTime(trip.siteReachedTime)} />}
          {trip.visitCompletedTime && <Row label="Visit Completed" value={formatDateTime(trip.visitCompletedTime)} />}
          <Row label="Ended" value={formatDateTime(trip.endTime)} />
        </Card>
      )}

      {trip.outboundPoints?.length > 0 || trip.returnPoints?.length > 0 ? (
        <Card>
          <Text style={typography.h3}>Recorded Route</Text>
          <Text style={typography.caption}>Outbound is blue. Return is green.</Text>
          <View style={styles.routeMap}>
            <OpenStreetMap
              center={trip.outboundPoints?.[0] || trip.returnPoints?.[0]}
              outboundPoints={trip.outboundPoints}
              returnPoints={trip.returnPoints}
              live={false}
            />
          </View>
        </Card>
      ) : (
        ['completed', 'submitted', 'approved', 'rejected'].includes(trip.status) && (
          <Card>
            <Text style={typography.h3}>Recorded Route</Text>
            <Text style={typography.caption}>
              No route was recorded for this trip — it may have been created while offline. Contact your admin if this looks wrong.
            </Text>
          </Card>
        )
      )}

      <Card>
        <Text style={typography.h3}>Site Contact</Text>
        <Row label="Name" value={trip.callerDetails?.callerName} />
      </Card>

      {(trip.engineerRemarks || trip.additionalKm || trip.additionalKmReason) && (
        <Card>
          <Text style={typography.h3}>Your Submission</Text>
          {!!trip.additionalKm && <Row label="Additional Distance" value={`${trip.additionalKm.toFixed(1)} km`} />}
          {!!trip.additionalKmReason && <Row label="Reason" value={trip.additionalKmReason} />}
          {!!trip.engineerRemarks && <Row label="Your Remarks" value={trip.engineerRemarks} />}
        </Card>
      )}

      <Card style={styles.totalCard}>
        <Row label="TA/DA" value={`₹${(trip.taDaAmount || 0).toFixed(2)}`} />
        <Row label="DA" value={`₹${(trip.daAmount || 0).toFixed(2)}`} />
        <Row label="Claimed Total" value={`₹${(trip.grandTotal || 0).toFixed(2)}`} bold />
      </Card>

      {['approved', 'rejected'].includes(trip.status) && (
        <Card style={styles.reviewCard}>
          <Text style={typography.h3}>{trip.status === 'approved' ? 'Reimbursement Approved' : 'Reimbursement Rejected'}</Text>
          {trip.status === 'approved' && (
            <Row
              label="Final Reimbursement Amount"
              value={`₹${(trip.approvedAmount ?? trip.grandTotal ?? 0).toFixed(2)}`}
              bold
            />
          )}
          <Row label="Reason" value={trip.adminReview?.remarks || 'No reason provided'} />
        </Card>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold }) {
  return <View style={styles.row}><Text style={typography.caption}>{label}</Text><Text style={[typography.body, styles.rowValue, bold && styles.bold]}>{value || '—'}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  rowValue: { flex: 1, textAlign: 'right' },
  bold: { fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  totalCard: { backgroundColor: colors.primaryLight },
  reviewCard: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  routeMap: { height: 260, marginTop: spacing.sm, overflow: 'hidden', borderRadius: radius.md },
});
