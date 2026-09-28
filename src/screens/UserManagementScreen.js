import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getUsers, createUser, updateUser, resetUserPassword } from '../services/userService';
import { getBranches } from '../services/branchService';
import { GRADES } from '../utils/policyRates';

const ROLE_LABELS = {
  service_engineer: 'Service Engineer',
  branch_manager: 'Branch Manager',
  hr: 'HR Manager',
  service_head: 'Service Head',
  account_dept: 'Account Dept',
  super_admin: 'Super Admin',
};

// GRADES now comes from utils/policyRates (IE1–IE8, matches backend schema)

export default function UserManagementScreen({ navigation }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');

  // Create User Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: '',
    employeeId: '',
    email: '',
    password: '',
    role: 'service_engineer',
    branchId: user?.branch?._id || '',
    grade: 'IE7',
  });
  const [submitting, setSubmitting] = useState(false);

  // Reset Password Modal
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [userToReset, setUserToReset] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const canManageCrossBranch = ['super_admin', 'service_head'].includes(user?.role);

  const fetchData = useCallback(async () => {
    try {
      const [usersData, branchData] = await Promise.all([
        getUsers({ limit: 100 }),
        getBranches().catch(() => ({ branches: [] })),
      ]);
      setUsers(usersData.users || []);
      setBranches(branchData.branches || []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = users.filter(u => {
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    if (!matchesRole) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const handleCreateUser = async () => {
    const { name, employeeId, password, role, branchId, grade } = newUserData;
    if (!name.trim() || !employeeId.trim() || !password.trim()) {
      Alert.alert('Required', 'Name, Employee ID, and Password are required.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await createUser({
        name: name.trim(),
        employeeId: employeeId.trim().toUpperCase(),
        email: newUserData.email.trim() || undefined,
        password: password.trim(),
        role,
        branch: canManageCrossBranch ? (branchId || branches[0]?._id) : user?.branch?._id,
        grade,
      });
      Alert.alert('Success', 'User created successfully.');
      setCreateModalVisible(false);
      setNewUserData({
        name: '',
        employeeId: '',
        email: '',
        password: '',
        role: 'service_engineer',
        branchId: user?.branch?._id || '',
        grade: 'IE7',
      });
      fetchData();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (targetUser) => {
    const action = targetUser.isActive ? 'deactivate' : 'activate';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} ${targetUser.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await updateUser(targetUser._id, { isActive: !targetUser.isActive });
              fetchData();
            } catch (e) {
              Alert.alert('Error', 'Failed to update user status.');
            }
          },
        },
      ]
    );
  };

  const handleOpenReset = (targetUser) => {
    setUserToReset(targetUser);
    setNewPassword('');
    setResetModalVisible(true);
  };

  const handleConfirmReset = async () => {
    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword(userToReset._id, newPassword.trim());
      Alert.alert('Success', `Password reset for ${userToReset.name}.`);
      setResetModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  const renderUserItem = ({ item }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userRole}>
              {ROLE_LABELS[item.role] || item.role} {item.grade ? `• Grade: ${item.grade}` : ''}
            </Text>
            <Text style={styles.userMeta}>
              ID: {item.employeeId} {item.branch?.name ? `• ${item.branch.name}` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: item.isActive ? colors.success + '20' : colors.danger + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: item.isActive ? colors.success : colors.danger }]}>
              {item.isActive ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenReset(item)}>
            <Text style={styles.actionBtnText}>🔑 Reset Pwd</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: item.isActive ? colors.danger : colors.success }]}
            onPress={() => handleToggleStatus(item)}
          >
            <Text style={[styles.actionBtnText, { color: item.isActive ? colors.danger : colors.success }]}>
              {item.isActive ? 'Deactivate' : 'Activate'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top action bar */}
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ID, email..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Add Staff</Text>
        </TouchableOpacity>
      </View>

      {/* Role filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.xs }}>
        {['all', 'service_engineer', 'branch_manager', 'hr', 'service_head', 'account_dept'].map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterChip, selectedRole === r && styles.filterChipActive]}
            onPress={() => setSelectedRole(r)}
          >
            <Text style={[styles.filterChipText, selectedRole === r && styles.filterChipTextActive]}>
              {r === 'all' ? 'All Roles' : ROLE_LABELS[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item._id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No users match the criteria.</Text>
            </View>
          }
        />
      )}

      {/* Create User Modal */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Add New Staff Member</Text>

              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={colors.textMuted}
                value={newUserData.name}
                onChangeText={(text) => setNewUserData(prev => ({ ...prev, name: text }))}
              />

              <Text style={styles.inputLabel}>Employee ID *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. ENG005"
                placeholderTextColor={colors.textMuted}
                value={newUserData.employeeId}
                onChangeText={(text) => setNewUserData(prev => ({ ...prev, employeeId: text }))}
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Email (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. ramesh@innoset.com"
                placeholderTextColor={colors.textMuted}
                value={newUserData.email}
                onChangeText={(text) => setNewUserData(prev => ({ ...prev, email: text }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Initial Password * (min 6 chars)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={newUserData.password}
                onChangeText={(text) => setNewUserData(prev => ({ ...prev, password: text }))}
                secureTextEntry
              />

              <Text style={styles.inputLabel}>Role</Text>
              <View style={styles.rolePickerRow}>
                {Object.keys(ROLE_LABELS).map((rk) => (
                  <TouchableOpacity
                    key={rk}
                    style={[styles.roleOption, newUserData.role === rk && styles.roleOptionActive]}
                    onPress={() => setNewUserData(prev => ({ ...prev, role: rk }))}
                  >
                    <Text style={[styles.roleOptionText, newUserData.role === rk && styles.roleOptionTextActive]}>
                      {ROLE_LABELS[rk]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Grade</Text>
              <View style={styles.gradeRow}>
                {GRADES.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.gradeChip, newUserData.grade === g && styles.gradeChipActive]}
                    onPress={() => setNewUserData(prev => ({ ...prev, grade: g }))}
                  >
                    <Text style={[styles.gradeChipText, newUserData.grade === g && styles.gradeChipTextActive]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {canManageCrossBranch && branches.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Branch</Text>
                  <View style={styles.branchSelectRow}>
                    {branches.map((b) => (
                      <TouchableOpacity
                        key={b._id}
                        style={[styles.branchOption, newUserData.branchId === b._id && styles.branchOptionActive]}
                        onPress={() => setNewUserData(prev => ({ ...prev, branchId: b._id }))}
                      >
                        <Text style={[styles.branchOptionText, newUserData.branchId === b._id && styles.branchOptionTextActive]}>
                          {b.city} ({b.code})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setCreateModalVisible(false)}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalConfirmBtn]}
                  onPress={handleCreateUser}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalConfirmText}>Create Staff</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={resetModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSub}>Staff: {userToReset?.name} ({userToReset?.employeeId})</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setResetModalVisible(false)}
                disabled={resetting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleConfirmReset}
                disabled={resetting}
              >
                {resetting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Reset</Text>
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

  topBar: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13,
  },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, justifyContent: 'center' },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },

  filterBar: { backgroundColor: colors.card, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: colors.white },

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
  userName: { fontSize: 16, fontWeight: '700', color: colors.text },
  userRole: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 2 },
  userMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 12, color: colors.text, fontWeight: '600' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  modalScroll: { padding: spacing.lg },
  modalBox: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  modalSub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  inputLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
  },

  rolePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  roleOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.xs, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  roleOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleOptionText: { fontSize: 11, color: colors.text, fontWeight: '600' },
  roleOptionTextActive: { color: colors.white },

  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  gradeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.xs, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  gradeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  gradeChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  gradeChipTextActive: { color: colors.white },

  branchSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  branchOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.xs, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  branchOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  branchOptionText: { fontSize: 11, color: colors.text, fontWeight: '600' },
  branchOptionTextActive: { color: colors.white },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modalConfirmBtn: { backgroundColor: colors.primary },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalConfirmText: { color: colors.white, fontWeight: '700' },
});
