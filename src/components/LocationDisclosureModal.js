import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import AppButton from './AppButton';
import { colors, spacing, typography, radius } from '../theme/theme';

export default function LocationDisclosureModal({ visible, onAccept, onDecline }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconContainer}>
            <Text style={{ fontSize: 32 }}>📍</Text>
          </View>
          
          <Text style={[typography.h2, styles.title]}>Background Location Required</Text>
          
          <Text style={styles.description}>
            InnoSet collects location data to track your travel route and calculate trip distance for accurate TA/DA reimbursements.
          </Text>
          
          <Text style={styles.description}>
            This tracking continues in the background <Text style={{ fontWeight: '700' }}>even when the app is closed or not in use</Text>, ensuring your entire trip is recorded accurately from start to finish.
          </Text>
          
          <View style={styles.buttonRow}>
            <AppButton title="Decline" variant="outline" onPress={onDecline} style={styles.button} />
            <AppButton title="Accept" onPress={onAccept} style={styles.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.md,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
  }
});
