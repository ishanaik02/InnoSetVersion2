import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import { useTrip } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import { createTrip } from '../services/tripService';
import { CONVEYANCE_TYPES } from '../utils/taDaCalculator';
import { isCarEligible } from '../utils/policyRates';
import { colors, spacing, typography, radius } from '../theme/theme';

const TRIP_TYPES = [
  { key: 'round', label: 'Round Trip', desc: 'Travel to site & return same day' },
  { key: 'stay', label: 'Stay Trip', desc: 'Overnight / multi-day travel' },
];

const CONVEYANCE_LABELS = { bike: 'Bike', car: 'Car', bus: 'Bus', train: 'Train' };

export default function NewTripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { updateTrip } = useTrip();
  const { user } = useAuth();
  const carEligible = isCarEligible(user?.grade);
  const [startLocation, setStartLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [date] = useState(new Date());
  const [tripType, setTripType] = useState(null);
  const [conveyance, setConveyance] = useState(null);
  const [isLocalVisit, setIsLocalVisit] = useState(false);
  const [locating, setLocating] = useState(false);
  const [creating, setCreating] = useState(false);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync(loc.coords);
      const label = place
        ? `${place.name || ''} ${place.street || ''}, ${place.city || ''}`.trim()
        : `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
      setStartLocation(label);
    } finally {
      setLocating(false);
    }
  };

  const canContinue = startLocation && destination && tripType && conveyance;

  const handleContinue = async () => {
    if (!canContinue) return;
    setCreating(true);
    const tripPayload = {
      startLocation,
      destination,
      date: date.toISOString(),
      tripType,
      conveyance,
      isLocalVisit,
      status: 'draft',
    };
    try {
      const res = await createTrip(tripPayload);
      const tripId = res?.trip?._id || res?._id;
      if (!tripId) throw new Error('No trip id returned');
      updateTrip({ ...tripPayload, id: tripId });
      setCreating(false);
      navigation.navigate(tripType === 'round' ? 'RoundTrip' : 'StayTrip');
    } catch (e) {
      // Offline or server unreachable — start with a local UUID so GPS
      // tracking can begin immediately.  The trip + route will be synced
      // to the server as soon as connectivity is restored.
      const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      updateTrip({ ...tripPayload, id: localId, pendingSync: true });
      setCreating(false);
      Alert.alert(
        'Offline mode',
        'Starting trip locally — GPS tracking will work. Your trip and route will sync to the office when you reconnect.',
      );
      navigation.navigate(tripType === 'round' ? 'RoundTrip' : 'StayTrip');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
      <Card>
        <Text style={typography.h3}>Start Location</Text>
        <View style={styles.rowInput}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Enter start location"
            placeholderTextColor={colors.textMuted}
            value={startLocation}
            onChangeText={setStartLocation}
          />
        </View>
        <AppButton
          title={locating ? 'Locating...' : '📍 Use Current Location'}
          variant="outline"
          onPress={useCurrentLocation}
          loading={locating}
        />
      </Card>

      <Card>
        <Text style={typography.h3}>Destination / Site Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter customer site address"
          placeholderTextColor={colors.textMuted}
          value={destination}
          onChangeText={setDestination}
        />
      </Card>

      <Card>
        <Text style={typography.h3}>Date</Text>
        <Text style={styles.dateText}>{date.toDateString()}</Text>
      </Card>

      <Card>
        <Text style={typography.h3}>Trip Type</Text>
        {TRIP_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.optionRow, tripType === t.key && styles.optionRowSelected]}
            onPress={() => setTripType(t.key)}
          >
            <View style={[styles.radio, tripType === t.key && styles.radioSelected]} />
            <View>
              <Text style={styles.optionLabel}>{t.label}</Text>
              <Text style={typography.caption}>{t.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </Card>

      <Card>
        <Text style={typography.h3}>Conveyance</Text>
        <View style={styles.chipRow}>
          {CONVEYANCE_TYPES.map((c) => {
            const disabled = c === 'car' && !carEligible;
            return (
              <TouchableOpacity
                key={c}
                disabled={disabled}
                style={[
                  styles.chip,
                  conveyance === c && styles.chipSelected,
                  disabled && styles.chipDisabled,
                ]}
                onPress={() => !disabled && setConveyance(c)}
              >
                <Text
                  style={[
                    styles.chipText,
                    conveyance === c && styles.chipTextSelected,
                    disabled && styles.chipTextDisabled,
                  ]}
                >
                  {CONVEYANCE_LABELS[c]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!carEligible && (
          <Text style={typography.caption}>
            Car conveyance is only reimbursable for grades IE2/IE1 per policy.
          </Text>
        )}
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>Local Visit</Text>
            <Text style={typography.caption}>Within Indore/current branch — DA does not apply</Text>
          </View>
          <Switch value={isLocalVisit} onValueChange={setIsLocalVisit} />
        </View>
      </Card>

      <AppButton
        title="Continue"
        onPress={handleContinue}
        disabled={!canContinue}
        loading={creating}
        style={{ marginVertical: spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  rowInput: { marginVertical: spacing.xs },
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
  dateText: { ...typography.body, marginTop: spacing.xs },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  optionRowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, marginRight: spacing.md,
  },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextSelected: { color: colors.white },
  chipTextDisabled: { color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});