import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { createBill } from '../services/billService';
import api from '../services/api';

export default function NewBillScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [loadingTrips, setLoadingTrips] = useState(true);

  const [conveyanceAmount, setConveyanceAmount] = useState('');
  const [daAmount, setDaAmount] = useState('');
  const [stayAmount, setStayAmount] = useState('');
  const [otherAmount, setOtherAmount] = useState('');
  const [otherDescription, setOtherDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/trips', { params: { status: 'completed' } });
        // Filter to only completed trips
        const completed = (data.trips || []).filter(t => ['completed', 'submitted'].includes(t.status));
        setTrips(completed);
      } catch (e) {
        Alert.alert('Error', 'Could not load trips.');
      } finally {
        setLoadingTrips(false);
      }
    })();
  }, []);

  const total = (
    (parseFloat(conveyanceAmount) || 0) +
    (parseFloat(daAmount) || 0) +
    (parseFloat(stayAmount) || 0) +
    (parseFloat(otherAmount) || 0)
  );

  const handleCreate = async () => {
    if (!selectedTrip) return Alert.alert('Select Trip', 'Please select a trip for this bill.');
    if (total <= 0) return Alert.alert('Amount Required', 'Please enter at least one expense amount.');

    setSubmitting(true);
    try {
      await createBill({
        trip: selectedTrip._id,
        conveyanceAmount: parseFloat(conveyanceAmount) || 0,
        daAmount: parseFloat(daAmount) || 0,
        stayAmount: parseFloat(stayAmount) || 0,
        otherAmount: parseFloat(otherAmount) || 0,
        otherDescription,
      });
      Alert.alert('Bill Created!', 'Your TA/DA bill has been saved as a draft.', [
        { text: 'OK', onPress: () => navigation.navigate('Bills') },
      ]);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to create bill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Trip Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Trip</Text>
        {loadingTrips ? (
          <ActivityIndicator color={colors.primary} />
        ) : trips.length === 0 ? (
          <Text style={styles.emptyText}>No completed trips found. Complete a trip first.</Text>
        ) : (
          <FlatList
            data={trips}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={t => t._id}
            contentContainerStyle={{ gap: spacing.sm }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tripChip, selectedTrip?._id === item._id && styles.tripChipSelected]}
                onPress={() => setSelectedTrip(item)}
              >
                <Text style={[styles.tripChipRoute, selectedTrip?._id === item._id && styles.tripChipTextSelected]} numberOfLines={1}>
                  {item.startLocation} → {item.destination}
                </Text>
                <Text style={[styles.tripChipDate, selectedTrip?._id === item._id && { color: 'rgba(255,255,255,0.8)' }]}>
                  {new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
        {selectedTrip && (
          <View style={styles.tripInfo}>
            <Text style={styles.tripInfoLabel}>Selected: </Text>
            <Text style={styles.tripInfoValue}>{selectedTrip.startLocation} → {selectedTrip.destination}</Text>
            <Text style={styles.tripInfoSub}>
              {selectedTrip.conveyance?.toUpperCase()} | {selectedTrip.tripType} | ₹{selectedTrip.grandTotal?.toLocaleString('en-IN')} calculated
            </Text>
          </View>
        )}
      </View>

      {/* Expense Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expense Breakdown</Text>

        <AmountField
          label="Conveyance / Travel (TA)"
          hint="Bus/Train/Bike fuel/Taxi fare"
          value={conveyanceAmount}
          onChangeText={setConveyanceAmount}
        />
        <AmountField
          label="Daily Allowance (DA)"
          hint="Per day food and incidental expenses"
          value={daAmount}
          onChangeText={setDaAmount}
        />
        <AmountField
          label="Stay / Lodging"
          hint="Hotel bills if overnight stay"
          value={stayAmount}
          onChangeText={setStayAmount}
        />
        <AmountField
          label="Other Expenses"
          hint="Any other eligible expenses"
          value={otherAmount}
          onChangeText={setOtherAmount}
        />

        {(parseFloat(otherAmount) > 0) && (
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Description for Other Expenses</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Describe the other expenses..."
              placeholderTextColor={colors.textMuted}
              value={otherDescription}
              onChangeText={setOtherDescription}
              multiline
              numberOfLines={2}
            />
          </View>
        )}
      </View>

      {/* Total Preview */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Claim Amount</Text>
        <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
      </View>

      {/* Submit */}
      <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleCreate} disabled={submitting}>
        {submitting
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.submitBtnText}>💾 Save as Draft</Text>
        }
      </TouchableOpacity>

      <Text style={styles.hint}>You can review and submit the bill for approval from the Bills screen.</Text>
    </ScrollView>
  );
}

function AmountField({ label, hint, value, onChangeText }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={styles.amountInputRow}>
        <Text style={styles.rupeeSymbol}>₹</Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40 },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },

  tripChip: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    minWidth: 160,
    backgroundColor: colors.background,
  },
  tripChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tripChipRoute: { fontSize: 13, fontWeight: '600', color: colors.text, maxWidth: 160 },
  tripChipTextSelected: { color: colors.white },
  tripChipDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  tripInfo: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  tripInfoLabel: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  tripInfoValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  tripInfoSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },

  inputGroup: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 2 },
  fieldHint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.xs },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  rupeeSymbol: { paddingLeft: spacing.md, fontSize: 16, color: colors.textMuted },
  amountInput: { flex: 1, padding: spacing.md, fontSize: 16, color: colors.text },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },

  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  totalValue: { color: colors.white, fontSize: 22, fontWeight: '800' },

  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  submitBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },
});
