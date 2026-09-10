import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, TextInput, Alert, Linking, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import OpenStreetMap from '../components/OpenStreetMap';
import { getTripDetail, reviewTrip, getReceiptUri, deleteTrip } from '../services/adminService';
import { colors, spacing, typography, radius } from '../theme/theme';

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
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminTripDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [receiptUris, setReceiptUris] = useState({});
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [reimbursementAmount, setReimbursementAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTripDetail(tripId);
      setTrip(data.trip);
      setReimbursementAmount(
        String((data.trip.approvedAmount ?? data.trip.grandTotal ?? 0).toFixed(2))
      );
      setReason(data.trip.adminReview?.remarks || '');

      const uris = {};
      for (const r of data.trip.receipts || []) {
        uris[r._id] = await getReceiptUri(tripId, r._id);
      }
      setReceiptUris(uris);
    } catch (e) {
      Alert.alert('Error', 'Could not load trip details.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleReview = async (decision) => {
    const parsed = Number(reimbursementAmount);
    if (decision === 'approved') {
      if (!Number.isFinite(parsed) || parsed < 0) {
        Alert.alert('Invalid amount', 'Enter a valid reimbursement amount before approving.');
        return;
      }
      const amountWasChanged = Math.abs(parsed - (trip.grandTotal || 0)) > 0.01;
      if (amountWasChanged && !reason.trim()) {
        Alert.alert(
          'Reason required',
          'You changed the reimbursement amount from the system-calculated total — please add a reason so the engineer (and admin history) can see why.'
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const data = await reviewTrip(tripId, decision, reason, parsed || 0);
      setTrip(data.trip);
      Alert.alert('Done', `Trip ${decision}.`);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update trip.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete this trip?',
      "This permanently removes the trip record, including any receipts and tracked route. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteTrip(tripId);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete this trip.');
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const totalDistance = (trip.outboundDistanceKm || 0) + (trip.returnDistanceKm || 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={typography.h2}>{trip.engineer?.name}</Text>
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[trip.status] || colors.textMuted }]}>
            <Text style={styles.badgeText}>{(trip.status || 'draft').replace('_', ' ')}</Text>
          </View>
        </View>
        <Text style={typography.caption}>{trip.engineer?.employeeId} · {trip.engineer?.email}</Text>
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
        <Card>
          <Text style={typography.h3}>Recorded Route</Text>
          <Text style={typography.caption}>
            No route was recorded — the trip was likely started while the engineer's device had no connection, so
            location points never reached the server.
          </Text>
        </Card>
      )}

      <Card>
        <Row label="Start" value={trip.startLocation} />
        <Row label="Destination" value={trip.destination} />
        <Row label="Date" value={new Date(trip.date).toDateString()} />
        <Row label="Trip Type" value={trip.tripType === 'round' ? 'Round Trip' : 'Stay Trip'} />
        <Row label="Conveyance" value={trip.conveyance} />
        <Row label="Caller / Site Manager" value={trip.callerDetails?.callerName} />
        <Row label="Outbound Distance" value={`${(trip.outboundDistanceKm || 0).toFixed(1)} km`} />
        <Row label="Return Distance" value={`${(trip.returnDistanceKm || 0).toFixed(1)} km`} />
        <Row label="Total Distance" value={`${totalDistance.toFixed(1)} km`} bold />
      </Card>

      {(trip.engineerRemarks || trip.additionalKm > 0) && (
        <Card>
          <Text style={typography.h3}>Engineer Claim Details</Text>
          {trip.additionalKm > 0 && <Row label="Additional Distance" value={`${trip.additionalKm.toFixed(2)} km`} />}
          {!!trip.additionalKmReason && <Row label="Additional Distance Reason" value={trip.additionalKmReason} />}
          {!!trip.engineerRemarks && <Row label="Engineer Remarks" value={trip.engineerRemarks} />}
        </Card>
      )}

      <Card style={styles.taDaCard}>
        <Text style={styles.taDaLabel}>TA/DA Amount</Text>
        <Text style={styles.taDaAmount}>₹{(trip.taDaAmount || 0).toFixed(2)}</Text>
        <View style={styles.divider} />
        <Text style={styles.taDaLabel}>Stay Expenses</Text>
        <Text style={styles.taDaAmount}>₹{(trip.stayExpensesTotal || 0).toFixed(2)}</Text>
        <View style={styles.divider} />
        <Text style={styles.taDaLabel}>System-Calculated Total</Text>
        <Text style={styles.taDaAmount}>₹{(trip.grandTotal || 0).toFixed(2)}</Text>
      </Card>

      {trip.receipts?.length > 0 && (
        <Card>
          <Text style={typography.h3}>Receipts ({trip.receipts.length})</Text>
          {trip.receipts.map((r) => (
            <View key={r._id} style={styles.receiptRow}>
              {receiptUris[r._id] && r.contentType?.startsWith('image/') ? (
                <TouchableOpacity onPress={() => Linking.openURL(receiptUris[r._id])}>
                  <Image source={{ uri: receiptUris[r._id] }} style={styles.receiptThumb} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.pdfBox}
                  onPress={() => receiptUris[r._id] && Linking.openURL(receiptUris[r._id])}
                >
                  <Text style={styles.pdfBoxText}>PDF</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={typography.body}>{r.category} {r.amount ? `· ₹${r.amount}` : ''}</Text>
                {!!r.notes && <Text style={typography.caption}>{r.notes}</Text>}
              </View>
            </View>
          ))}
        </Card>
      )}

      {['submitted', 'approved'].includes(trip.status) ? (
        <Card>
          <Text style={typography.h3}>{trip.status === 'approved' ? 'Correct Reimbursement Amount' : 'Review'}</Text>
          <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
            {trip.status === 'approved'
              ? 'This trip is already approved — you can still adjust the final amount if it was wrong.'
              : 'Reimbursement amount (defaults to the system-calculated total — edit to override)'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Reimbursement amount (₹)"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={reimbursementAmount}
            onChangeText={setReimbursementAmount}
          />
          {(() => {
            const parsed = Number(reimbursementAmount);
            const grand = trip.grandTotal || 0;
            if (!Number.isFinite(parsed) || Math.abs(parsed - grand) <= 0.01) return null;
            const diff = parsed - grand;
            return (
              <Text style={styles.deltaHint}>
                {diff > 0 ? '▲' : '▼'} {diff > 0 ? 'Adjusted up' : 'Adjusted down'} by ₹{Math.abs(diff).toFixed(2)} from
                the system-calculated ₹{grand.toFixed(2)}
              </Text>
            );
          })()}
          <Text style={[typography.caption, { marginBottom: spacing.xs, marginTop: spacing.xs }]}>
            Reason (required if you change the amount — the engineer will see this)
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Fuel bill only covers actual distance travelled"
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <AppButton
            title={trip.status === 'approved' ? 'Save Corrected Amount' : 'Approve'}
            onPress={() => handleReview('approved')}
            loading={submitting}
          />
          {trip.status === 'submitted' && (
            <AppButton title="Reject" variant="danger" onPress={() => handleReview('rejected')} loading={submitting} />
          )}
        </Card>
      ) : (
        <Card style={styles.decisionCard}>
          <Text style={typography.h3}>Final Decision</Text>
          <Row
            label="Status"
            value={(trip.status || '').charAt(0).toUpperCase() + (trip.status || '').slice(1)}
            bold
          />
          <Row label="Reason" value={trip.adminReview?.remarks || 'No reason provided'} />
          {trip.reviewedAt && <Row label="Reviewed On" value={formatDateTime(trip.reviewedAt)} />}
        </Card>
      )}

      {trip.status !== 'submitted' && (
        <AppButton
          title="Delete Trip"
          variant="danger"
          onPress={handleDelete}
          loading={submitting}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold }) {
  return (
    <View style={styles.row}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, bold && { fontWeight: '700' }]}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  taDaCard: { backgroundColor: colors.primaryLight },
  decisionCard: { borderWidth: 1, borderColor: colors.border },
  deltaHint: { color: colors.warning, fontWeight: '700', fontSize: 13, marginBottom: spacing.sm },
  taDaLabel: { ...typography.h3, marginTop: spacing.xs },
  taDaAmount: { fontSize: 22, fontWeight: '800', color: colors.primary, marginVertical: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  receiptRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  receiptThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.border },
  pdfBox: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBoxText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  routeMap: { height: 260, marginTop: spacing.sm, overflow: 'hidden', borderRadius: radius.md },
});