import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Image, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import OpenStreetMap from '../components/OpenStreetMap';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { useTrip } from '../context/TripContext';
import { calculateRouteDistanceKm, mergePoints } from '../utils/distanceCalculator';
import { deriveStageFromTrip } from '../utils/tripStage';
import { uploadReceipt, createTrip } from '../services/tripService';
import {
  requestBackgroundLocationPermissions,
  startBackgroundTracking,
  isTrackingRunning,
  startUploadWorker,
  updateTrackingPhase,
  finishTracking,
  getRecordedPoints,
} from '../services/backgroundLocationService';
import { colors, spacing, typography, radius } from '../theme/theme';

const EXPENSE_TYPES = ['hotel', 'food', 'other'];

export default function StayTripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { activeTrip, updateTrip, addOutboundPoint, addReturnPoint, addStayExpense, updateStayExpenseByUri } = useTrip();
  const [stage, setStage] = useState(() => deriveStageFromTrip(activeTrip));
  const stageRef = useRef('idle');
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const [expenseType, setExpenseType] = useState('hotel');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseUri, setExpenseUri] = useState(null);
  const [expenseMimeType, setExpenseMimeType] = useState(null);
  const [uploadingExpense, setUploadingExpense] = useState(false);
  const [region, setRegion] = useState(null);
  const locationSubscriptionRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (update) => {
          // Reject fixes with poor accuracy — same threshold as the
          // background task.  Raw fixes > 30 m off inflate the route.
          if (update.coords.accuracy != null && update.coords.accuracy > 30) return;
          const point = { latitude: update.coords.latitude, longitude: update.coords.longitude };
          setRegion(point);
          // Feeds the live map/polyline directly — see RoundTripScreen.js
          // for why (restores v1's always-working behavior; the background
          // TaskManager task below is reconciled in separately at
          // handleReachSite/handleEndTrip, purely for backend durability).
          if (stageRef.current === 'outbound') addOutboundPoint(point);
          else if (stageRef.current === 'returning') addReturnPoint(point);
        }
      );
    })();
    return () => {
      locationSubscriptionRef.current?.remove();
    };
  }, []);

  // If the trip was restored from AsyncStorage after an app kill, restart
  // the background GPS task so tracking continues seamlessly.
  useEffect(() => {
    (async () => {
      if (activeTrip.status !== 'in_progress' && activeTrip.status !== 'returning') return;
      const running = await isTrackingRunning();
      if (running) return;
      const tripId = activeTrip._id || activeTrip.id;
      if (!tripId) return;
      const phase = activeTrip.status === 'returning' ? 'return' : 'outbound';
      try {
        const granted = await requestBackgroundLocationPermissions();
        if (!granted) return;
        await startBackgroundTracking(tripId, phase);
        startUploadWorker();
      } catch {
        // Background restart failed — non-fatal, foreground watcher still works.
      }
    })();
  }, [activeTrip.status]);

  const handleStartTrip = async () => {
    let tripId = activeTrip._id || activeTrip.id;
    if (!tripId) {
      try {
        const res = await createTrip({
          startLocation: activeTrip.startLocation,
          destination: activeTrip.destination,
          date: activeTrip.date,
          tripType: activeTrip.tripType,
          conveyance: activeTrip.conveyance,
          isLocalVisit: !!activeTrip.isLocalVisit,
          status: 'draft',
        });
        tripId = res?.trip?._id || res?._id;
      } catch (e) {
        tripId = null;
      }
      if (!tripId) {
        Alert.alert(
          'Could not reach the server',
          'This trip has no server record yet, so its route can\u2019t sync to the office. Check your connection and try again.'
        );
        return;
      }
      updateTrip({ id: tripId });
    }

    setShowDisclosure(true);
  };

  const handleAcceptLocation = async () => {
    setShowDisclosure(false);
    const tripId = activeTrip._id || activeTrip.id;

    const granted = await requestBackgroundLocationPermissions();
    if (!granted) {
      Alert.alert(
        'Background location needed',
        'To keep tracking your route when the app is minimized, please allow location access "Always" in settings.'
      );
      return;
    }
    try {
      await startBackgroundTracking(tripId, 'outbound');
    } catch (e) {
      Alert.alert('Pending trip sync', e.message);
      return;
    }
    updateTrip({ status: 'in_progress', startTime: new Date().toISOString() });
    setStage('outbound');
    startUploadWorker();
  };

  const handleReachSite = async () => {
    const backgroundPoints = await getRecordedPoints('outbound');
    const foregroundPoints = activeTrip.outboundPoints;
    // Prefer background points (reliable across fg/bg transitions) but
    // merge any foreground-only points captured before/after the bg task.
    const finalPoints = mergePoints(backgroundPoints, foregroundPoints);
    const distance = calculateRouteDistanceKm(finalPoints);
    await updateTrackingPhase('stay');
    updateTrip({
      status: 'at_site',
      siteReachedTime: new Date().toISOString(),
      outboundPoints: finalPoints,
      outboundDistanceKm: distance,
    });
    setStage('at_site'); // engineer now adds stay details & expenses
  };

  const applyPickerResult = (result) => {
    if (!result.canceled && result.assets?.length) {
      setExpenseUri(result.assets[0].uri);
      setExpenseMimeType(result.assets[0].mimeType || null);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'Please allow camera access to photograph the bill.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    applyPickerResult(result);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    applyPickerResult(result);
  };

  // The button promises "Camera/Gallery" — give the engineer an actual
  // choice instead of silently only ever opening the gallery.
  const pickImage = () => {
    Alert.alert('Add Bill Photo', 'Choose a source', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAddExpense = async () => {
    if (!expenseAmount) {
      Alert.alert('Enter amount', 'Please enter the expense amount.');
      return;
    }
    const uri = expenseUri;
    const mimeType = expenseMimeType;
    const amount = Number(expenseAmount);
    const notes = expenseNotes;
    const type = expenseType;

    addStayExpense({ type, amount, notes, uri, mimeType, receiptId: null, uploadFailed: false });
    setExpenseAmount('');
    setExpenseNotes('');
    setExpenseUri(null);
    setExpenseMimeType(null);

    // Store the bill/food photo straight to MongoDB (via the trip's receipts
    // array) as soon as it's attached, rather than waiting for final submit —
    // so it's safely persisted even if the engineer's device loses the photo
    // cache or the app is closed before the trip is submitted.
    if (uri && activeTrip.id) {
      setUploadingExpense(true);
      try {
        await uploadReceipt(
          activeTrip.id,
          { uri, mimeType, name: `${type}_${Date.now()}` },
          type,
          { amount, notes }
        );
        updateStayExpenseByUri(uri, { receiptId: 'uploaded' });
      } catch (e) {
        // Backend unreachable / upload failed — flag it so TripSummaryScreen
        // can retry this one at submit time instead of silently losing it.
        updateStayExpenseByUri(uri, { uploadFailed: true });
      } finally {
        setUploadingExpense(false);
      }
    }
  };

  const handleCompleteVisit = () => {
    updateTrip({ status: 'returning', visitCompletedTime: new Date().toISOString() });
    setStage('returning');
  };

  const handleStartReturn = async () => {
    await updateTrackingPhase('return');
  };

  const handleEndTrip = async () => {
    await finishTracking();
    const backgroundPoints = await getRecordedPoints('return');
    const foregroundPoints = activeTrip.returnPoints;
    const finalPoints = mergePoints(backgroundPoints, foregroundPoints);
    const returnDistance = calculateRouteDistanceKm(finalPoints);
    updateTrip({
      status: 'completed',
      endTime: new Date().toISOString(),
      returnPoints: finalPoints,
      returnDistanceKm: returnDistance,
    });
    navigation.navigate('TripSummary');
  };

  return (
    <FlatList
      style={styles.container}
      data={stage === 'at_site' ? activeTrip.stayExpenses : []}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <>
          <LocationDisclosureModal 
            visible={showDisclosure} 
            onAccept={handleAcceptLocation} 
            onDecline={() => setShowDisclosure(false)} 
          />
          {region && (
            <View style={styles.mapWrap}>
              <OpenStreetMap
                center={region}
                outboundPoints={activeTrip.outboundPoints}
                returnPoints={activeTrip.returnPoints}
              />
            </View>
          )}

          <Card>
            <Text style={typography.h3}>{activeTrip.destination || 'Site'} — Stay Trip</Text>
            <Text style={typography.caption}>Status: {stage.replace('_', ' ').toUpperCase()}</Text>
            {stage === 'idle' && <AppButton title="Start Trip" onPress={handleStartTrip} />}
            {stage === 'outbound' && <AppButton title="Reach Site" onPress={handleReachSite} />}
            {stage === 'at_site' && (
              <AppButton title="Complete Visit" onPress={handleCompleteVisit} />
            )}
            {stage === 'returning' && (
              <>
                <AppButton title="Start Return Journey" variant="outline" onPress={handleStartReturn} />
                <AppButton title="End Trip" variant="secondary" onPress={handleEndTrip} />
              </>
            )}
          </Card>

          {stage === 'at_site' && (
            <Card>
              <Text style={typography.h3}>Add Stay Expense</Text>
              <View style={styles.chipRow}>
                {EXPENSE_TYPES.map((t) => (
                  <AppButton
                    key={t}
                    title={t.charAt(0).toUpperCase() + t.slice(1)}
                    variant={expenseType === t ? 'primary' : 'outline'}
                    onPress={() => setExpenseType(t)}
                    style={{ marginRight: spacing.sm, minHeight: 40, paddingHorizontal: spacing.md }}
                  />
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Amount (₹)"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={expenseAmount}
                onChangeText={setExpenseAmount}
              />
              <TextInput
                style={styles.input}
                placeholder="Notes / comments (optional)"
                placeholderTextColor={colors.textMuted}
                value={expenseNotes}
                onChangeText={setExpenseNotes}
              />
              <AppButton
                title={expenseUri ? 'Bill Attached ✓' : '📷 Upload Bill (Camera/Gallery)'}
                variant="outline"
                onPress={pickImage}
              />
              {expenseUri && <Image source={{ uri: expenseUri }} style={styles.preview} />}
              <AppButton title="Add Expense" onPress={handleAddExpense} loading={uploadingExpense} />
            </Card>
          )}
        </>
      }
      renderItem={({ item }) => (
        <Card style={styles.expenseRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseType}>{item.type.toUpperCase()}</Text>
            {item.notes ? <Text style={typography.caption}>{item.notes}</Text> : null}
            {item.uri ? (
              <Text style={[typography.caption, item.uploadFailed ? styles.uploadFailedText : styles.uploadedText]}>
                {item.uploadFailed ? '⚠ Bill will retry on submit' : '✓ Bill saved'}
              </Text>
            ) : null}
          </View>
          <Text style={styles.expenseAmount}>₹{item.amount}</Text>
        </Card>
      )}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  mapWrap: { height: 220, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md },
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
  chipRow: { flexDirection: 'row', marginBottom: spacing.sm, flexWrap: 'wrap' },
  preview: { width: '100%', height: 140, borderRadius: radius.md, marginVertical: spacing.sm },
  expenseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expenseType: { fontWeight: '700', color: colors.text },
  expenseAmount: { fontWeight: '700', color: colors.primary, fontSize: 16 },
  uploadedText: { color: colors.success, marginTop: 2 },
  uploadFailedText: { color: colors.warning, marginTop: 2 },
});