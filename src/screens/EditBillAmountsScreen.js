import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { getBillById, editBillAmounts } from '../services/billService';

export default function EditBillAmountsScreen({ route, navigation }) {
  const { billId } = route.params;
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [conveyance, setConveyance] = useState('');
  const [da, setDa] = useState('');
  const [stay, setStay] = useState('');
  const [other, setOther] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getBillById(billId);
        const b = data.bill;
        setBill(b);
        setConveyance(String(b.conveyanceAmount ?? 0));
        setDa(String(b.dailyAllowanceAmount ?? 0));
        setStay(String(b.stayAllowanceAmount ?? 0));
        setOther(String(b.otherExpensesAmount ?? 0));
      } catch (e) {
        Alert.alert('Error', 'Failed to load bill details.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [billId, navigation]);

  const handleSave = async () => {
    if (!remarks.trim()) {
      Alert.alert('Required', 'Please enter remarks explaining amount modifications.');
      return;
    }

    setSaving(true);
    try {
      await editBillAmounts(billId, {
        conveyanceAmount: Number(conveyance) || 0,
        dailyAllowanceAmount: Number(da) || 0,
        stayAllowanceAmount: Number(stay) || 0,
        otherExpensesAmount: Number(other) || 0,
        remarks: remarks.trim(),
      });
      Alert.alert('Success', 'Bill amounts updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to update amounts.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const newTotal = (Number(conveyance) || 0) + (Number(da) || 0) + (Number(stay) || 0) + (Number(other) || 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.billNumber}>{bill?.billNumber}</Text>
        <Text style={styles.subTitle}>Engineer: {bill?.employee?.name}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Conveyance Amount (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={conveyance}
          onChangeText={setConveyance}
        />

        <Text style={styles.label}>Daily Allowance (DA) (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={da}
          onChangeText={setDa}
        />

        <Text style={styles.label}>Stay Allowance (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={stay}
          onChangeText={setStay}
        />

        <Text style={styles.label}>Other Expenses (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={other}
          onChangeText={setOther}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Adjusted Grand Total:</Text>
          <Text style={styles.totalValue}>₹{newTotal.toLocaleString('en-IN')}</Text>
        </View>

        <Text style={styles.label}>Adjustment Remarks *</Text>
        <TextInput
          style={[styles.input, styles.remarksInput]}
          placeholder="Explain reason for amount change..."
          placeholderTextColor={colors.textMuted}
          value={remarks}
          onChangeText={setRemarks}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save & Apply Adjustments</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { marginBottom: spacing.md },
  billNumber: { fontSize: 20, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
  remarksInput: { minHeight: 70, textAlignVertical: 'top' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.primary },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
