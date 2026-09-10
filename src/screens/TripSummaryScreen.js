import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Image, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import { useTrip } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import { calculateTaDa, requiresReceiptUpload } from '../utils/taDaCalculator';
import { calculateDaAmount, getLodgingLimit } from '../utils/policyRates';
import { formatDuration } from '../utils/distanceCalculator';
import { submitTrip, updateTrip as updateTripApi, uploadReceipt, savePendingTripSubmission } from '../services/tripService';
import { colors, spacing, typography, radius } from '../theme/theme';

export default function TripSummaryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { activeTrip, updateTrip, addReceipt, resetTrip } = useTrip();
  const { user } = useAuth();
  const [ticketAmount, setTicketAmount] = useState(String(activeTrip.ticketAmount || ''));
  const [ticketUri, setTicketUri] = useState(null);
  const [ticketMimeType, setTicketMimeType] = useState(null);
  const [ticketName, setTicketName] = useState(null);
  const [callerDetails, setCallerDetails] = useState(activeTrip.callerDetails || {});
  const [engineerRemarks, setEngineerRemarks] = useState(activeTrip.engineerRemarks || '');
  const [additionalKm, setAdditionalKm] = useState(String(activeTrip.additionalKm || ''));
  const [additionalKmReason, setAdditionalKmReason] = useState(activeTrip.additionalKmReason || '');
  const [submitting, setSubmitting] = useState(false);

  const trackedDistance = (activeTrip.outboundDistanceKm || 0) + (activeTrip.returnDistanceKm || 0);
  const additionalKmValue = Math.max(0, Number(additionalKm) || 0);
  const totalDistance = trackedDistance + additionalKmValue;
  const needsReceipt = requiresReceiptUpload(activeTrip.conveyance);

  const taDa = useMemo(
    () => calculateTaDa(activeTrip.conveyance, totalDistance, Number(ticketAmount) || 0, user?.grade),
    [activeTrip.conveyance, totalDistance, ticketAmount, user?.grade]
  );

  const daInfo = useMemo(
    () =>
      calculateDaAmount({
        distanceKm: totalDistance,
        isLocalVisit: !!activeTrip.isLocalVisit,
        tripType: activeTrip.tripType,
      }),
    [totalDistance, activeTrip.isLocalVisit, activeTrip.tripType]
  );

  const hotelExpense = (activeTrip.stayExpenses || []).find((e) => e.type === 'hotel');
  const lodgingLimit = hotelExpense ? getLodgingLimit(user?.grade, !!hotelExpense.uri) : null;
  const lodgingOverLimit = lodgingLimit != null && Number(hotelExpense?.amount || 0) > lodgingLimit;

  const stayTotal = (activeTrip.stayExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const grandTotal = taDa.amount + daInfo.amount + stayTotal;

  const pickTicket = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setTicketUri(asset.uri);
      setTicketMimeType(asset.mimeType || null);
      setTicketName(asset.name || null);
    }
  };

  const handleSubmit = async () => {
    if (needsReceipt && !ticketAmount) {
      Alert.alert('Ticket amount required', 'Please enter the amount from your ticket/receipt.');
      return;
    }
    setSubmitting(true);
    try {
      const claimDetails = {
        ticketAmount: Number(ticketAmount) || 0,
        callerDetails,
        engineerRemarks: engineerRemarks.trim(),
        additionalKm: additionalKmValue,
        additionalKmReason: additionalKmReason.trim(),
      };
      updateTrip(claimDetails);

      if (activeTrip.id) {
        if (ticketUri) {
          await uploadReceipt(
            activeTrip.id,
            { uri: ticketUri, mimeType: ticketMimeType, name: ticketName },
            'ticket',
            { amount: Number(ticketAmount) || 0 }
          );
        }

        // Any stay-expense bill/food photo that failed to upload at the time
        // it was added (backend briefly unreachable, etc.) gets one more
        // attempt here so a receipt is never silently missing from the
        // submitted claim.
        const failedExpenses = (activeTrip.stayExpenses || []).filter((e) => e.uri && e.uploadFailed);
        for (const expense of failedExpenses) {
          try {
            await uploadReceipt(
              activeTrip.id,
              { uri: expense.uri, mimeType: expense.mimeType, name: `${expense.type}_${Date.now()}` },
              expense.type,
              { amount: expense.amount, notes: expense.notes }
            );
          } catch (e) {
            // Leave it flagged — engineer can see it wasn't saved and re-attach later.
          }
        }

        await updateTripApi(activeTrip.id, {
          outboundPoints: activeTrip.outboundPoints,
          returnPoints: activeTrip.returnPoints,
          outboundDistanceKm: activeTrip.outboundDistanceKm,
          returnDistanceKm: activeTrip.returnDistanceKm,
          startTime: activeTrip.startTime,
          siteReachedTime: activeTrip.siteReachedTime,
          visitCompletedTime: activeTrip.visitCompletedTime,
          endTime: activeTrip.endTime,
          ticketAmount: Number(ticketAmount) || 0,
          isLocalVisit: !!activeTrip.isLocalVisit,
          ...claimDetails,
          taDaAmount: taDa.amount,
          daAmount: daInfo.amount,
          stayExpensesTotal: stayTotal,
          grandTotal,
          status: 'completed',
        });
        await submitTrip(activeTrip.id);
      }

      Alert.alert('Submitted', 'Trip report and reimbursement request sent for approval.');
      resetTrip();
      navigation.navigate('Dashboard');
    } catch (e) {
      // Save the full trip payload so it can be submitted automatically
      // when connectivity is restored.
      const claimDetails = {
        ticketAmount: Number(ticketAmount) || 0,
        callerDetails,
        engineerRemarks: engineerRemarks.trim(),
        additionalKm: additionalKmValue,
        additionalKmReason: additionalKmReason.trim(),
      };
      const offlineTrip = {
        ...activeTrip,
        ...claimDetails,
        outboundPoints: activeTrip.outboundPoints || [],
        returnPoints: activeTrip.returnPoints || [],
        taDaAmount: taDa.amount,
        daAmount: daInfo.amount,
        stayExpensesTotal: stayTotal,
        grandTotal,
      };
      await savePendingTripSubmission(offlineTrip);
      Alert.alert(
        'Saved offline',
        'Your trip will be submitted automatically when you reconnect to the internet.',
      );
      resetTrip();
      navigation.navigate('Dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
      <Card>
        <Text style={typography.h2}>Trip Summary</Text>
        <SummaryRow label="Start" value={activeTrip.startLocation} />
        <SummaryRow label="Destination" value={activeTrip.destination} />
        <SummaryRow label="Trip Type" value={activeTrip.tripType === 'round' ? 'Round Trip' : 'Stay Trip'} />
        <SummaryRow label="Conveyance" value={activeTrip.conveyance} />
        <SummaryRow label="Duration" value={formatDuration(activeTrip.startTime, activeTrip.endTime)} />
        <SummaryRow label="Outbound Distance" value={`${activeTrip.outboundDistanceKm || 0} km`} />
        <SummaryRow label="Return Distance" value={`${activeTrip.returnDistanceKm || 0} km`} />
        {additionalKmValue > 0 && <SummaryRow label="Additional Distance" value={`${additionalKmValue.toFixed(2)} km`} />}
        <SummaryRow label="Total Claimed Distance" value={`${totalDistance.toFixed(2)} km`} bold />
      </Card>

      <Card>
        <Text style={typography.h3}>Site Contact</Text>
        <TextInput
          style={styles.input}
          placeholder="Caller / site manager name"
          placeholderTextColor={colors.textMuted}
          value={callerDetails.callerName || ''}
          onChangeText={(callerName) => setCallerDetails((current) => ({ ...current, callerName }))}
        />
      </Card>

      <Card>
        <Text style={typography.h3}>Additional Distance</Text>
        <TextInput
          style={styles.input}
          placeholder="Additional kilometres"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={additionalKm}
          onChangeText={setAdditionalKm}
        />
        <TextInput
          style={styles.input}
          placeholder="Reason for additional kilometres (optional)"
          placeholderTextColor={colors.textMuted}
          value={additionalKmReason}
          onChangeText={setAdditionalKmReason}
          multiline
        />
      </Card>

      <Card>
        <Text style={typography.h3}>Remarks for Admin</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Add any trip or reimbursement remarks"
          placeholderTextColor={colors.textMuted}
          value={engineerRemarks}
          onChangeText={setEngineerRemarks}
          multiline
          textAlignVertical="top"
        />
      </Card>

      {needsReceipt && (
        <Card>
          <Text style={typography.h3}>Ticket / Receipt ({activeTrip.conveyance})</Text>
          <TextInput
            style={styles.input}
            placeholder="Amount from ticket (₹)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={ticketAmount}
            onChangeText={setTicketAmount}
          />
          <AppButton
            title={ticketUri ? 'Receipt Attached ✓' : '📎 Upload Ticket/Receipt'}
            variant="outline"
            onPress={pickTicket}
          />
        </Card>
      )}

      {activeTrip.stayExpenses?.length > 0 && (
        <Card>
          <Text style={typography.h3}>Stay Expenses</Text>
          {activeTrip.stayExpenses.map((e, i) => (
            <SummaryRow key={i} label={e.type} value={`₹${e.amount}`} />
          ))}
          <SummaryRow label="Stay Total" value={`₹${stayTotal.toFixed(2)}`} bold />
        </Card>
      )}

      {hotelExpense && lodgingLimit != null && (
        <Card style={lodgingOverLimit ? styles.warningCard : undefined}>
          <Text style={typography.h3}>Lodging Limit ({user?.grade || '—'})</Text>
          <Text style={typography.body}>
            Hotel bill: ₹{Number(hotelExpense.amount || 0).toFixed(2)} · Policy limit
            {hotelExpense.uri ? ' (with bill)' : ' (without bill)'}: ₹{lodgingLimit}
          </Text>
          {lodgingOverLimit && (
            <Text style={[typography.caption, { color: colors.warning }]}>
              ⚠ Exceeds the policy limit for your grade — the excess may not be reimbursed.
            </Text>
          )}
        </Card>
      )}

      <Card style={styles.taDaCard}>
        <Text style={styles.taDaLabel}>Conveyance (TA)</Text>
        <Text style={styles.taDaAmount}>₹{taDa.amount.toFixed(2)}</Text>
        <Text style={typography.caption}>{taDa.breakdown}</Text>
        {taDa.mode === 'ineligible' && (
          <Text style={[typography.caption, { color: colors.warning }]}>⚠ {taDa.breakdown}</Text>
        )}
        <View style={styles.divider} />
        <Text style={styles.taDaLabel}>DA</Text>
        <Text style={styles.taDaAmount}>₹{daInfo.amount.toFixed(2)}</Text>
        <Text style={typography.caption}>{daInfo.breakdown}</Text>
        <View style={styles.divider} />
        <Text style={styles.taDaLabel}>Grand Total (incl. stay expenses)</Text>
        <Text style={styles.taDaAmount}>₹{grandTotal.toFixed(2)}</Text>
      </Card>

      <AppButton
        title="Submit Trip Report & Reimbursement"
        onPress={handleSubmit}
        loading={submitting}
        style={{ marginVertical: spacing.lg }}
      />
    </ScrollView>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.row}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, bold && { fontWeight: '700' }]}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
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
  },
  multilineInput: { minHeight: 96 },
  taDaCard: { backgroundColor: colors.primaryLight },
  warningCard: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: colors.warning },
  taDaLabel: { ...typography.h3, marginTop: spacing.xs },
  taDaAmount: { fontSize: 28, fontWeight: '800', color: colors.primary, marginVertical: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});