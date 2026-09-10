import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import { createEngineer } from '../services/adminService';
import { getBranches } from '../services/branchService';
import { GRADES } from '../utils/policyRates';
import { colors, spacing, typography, radius } from '../theme/theme';

const DEFAULT_BRANCHES = [
  { _id: 'indore', name: 'Indore Branch', code: 'BR01', city: 'Indore' },
  { _id: 'bhopal', name: 'Bhopal Branch', code: 'BR02', city: 'Bhopal' },
  { _id: 'jabalpur', name: 'Jabalpur Branch', code: 'BR03', city: 'Jabalpur' },
  { _id: 'ujjain', name: 'Ujjain Branch', code: 'BR04', city: 'Ujjain' },
  { _id: 'dewas', name: 'Dewas Branch', code: 'BR05', city: 'Dewas' },
];

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminAddEngineerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generateTempPassword());
  const [grade, setGrade] = useState('IE7');
  const [branches, setBranches] = useState(DEFAULT_BRANCHES);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getBranches();
        if (data.branches && data.branches.length > 0) {
          setBranches(data.branches);
          setSelectedBranchId(data.branches[0]._id);
        }
      } catch (e) {
        // Fallback to default branches if network/offline
        setSelectedBranchId(DEFAULT_BRANCHES[0]._id);
      }
    })();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !employeeId.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Name, Employee ID, and Password are required.');
      return;
    }
    if (password.trim().length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await createEngineer({
        name: name.trim(),
        employeeId: employeeId.trim(),
        email: email.trim() || undefined,
        password: password.trim(),
        grade,
        branch: selectedBranchId,
      });
      Alert.alert(
        'Engineer added',
        `Share these sign-in details with ${data.engineer.name}:\n\nEmployee ID: ${data.engineer.employeeId}\nPassword: ${password.trim()}\nBranch: ${data.engineer.branch?.name || 'Assigned'}\n\nThey should change this password after their first login.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not create engineer account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
      <Card>
        <Text style={typography.h3}>Engineer Details</Text>
        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>
          Fields marked * are required. The engineer will use Employee ID (or email) + password to log in.
        </Text>

        {/* Dealership / Branch Selection */}
        <Text style={styles.label}>Dealership Branch *</Text>
        <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
          Choose the dealership branch this engineer belongs to:
        </Text>
        <View style={styles.branchGrid}>
          {branches.map((b) => {
            const isSelected = selectedBranchId === b._id;
            return (
              <TouchableOpacity
                key={b._id}
                style={[styles.branchCard, isSelected && styles.branchCardActive]}
                onPress={() => setSelectedBranchId(b._id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.branchCode, isSelected && styles.branchTextActive]}>{b.code}</Text>
                <Text style={[styles.branchName, isSelected && styles.branchTextActive]}>{b.name || b.city}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="e.g. Ramesh Kumar" value={name} onChangeText={setName} />

        <Text style={styles.label}>Employee ID *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. EMP1024"
          placeholderTextColor={colors.textMuted}
          value={employeeId}
          onChangeText={setEmployeeId}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Email (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. ramesh@company.com"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Grade</Text>
        <View style={styles.gradeRow}>
          {GRADES.map((g) => (
            <Text
              key={g}
              onPress={() => setGrade(g)}
              style={[styles.gradeChip, grade === g && styles.gradeChipActive]}
            >
              {g}
            </Text>
          ))}
        </View>

        <Text style={styles.label}>Password *</Text>
        <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
          A temporary password is pre-filled — edit it if you'd like to set your own.
        </Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} autoCapitalize="none" />

        <AppButton title="Add Engineer" onPress={handleCreate} loading={submitting} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  label: { ...typography.body, fontWeight: '700', marginTop: spacing.sm, marginBottom: 4 },
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
  branchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  branchCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minWidth: '47%',
    flex: 1,
  },
  branchCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  branchCode: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  branchName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  branchTextActive: {
    color: colors.primary,
  },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  gradeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    color: colors.text,
    overflow: 'hidden',
  },
  gradeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    color: colors.white,
    fontWeight: '700',
  },
});