import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Card from '../components/Card';
import AppButton from '../components/AppButton';
import OpenStreetMap from '../components/OpenStreetMap';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { useTrip } from '../context/TripContext';
import { createTrip } from '../services/tripService';
import { calculateRouteDistanceKm, mergePoints } from '../utils/distanceCalculator';
import { deriveStageFromTrip } from '../utils/tripStage';
import {
  requestBackgroundLocationPermissions,
  startBackgroundTracking,
  isTrackingRunning,
  startUploadWorker,
  updateTrackingPhase,
  finishTracking,
  getRecordedPoints,
} from '../services/backgroundLocationService';
import { colors, spacing, typography } from '../theme/theme';

// Trip stages for a Round Trip, matching the spec's flow exactly:
// idle -> outbound (Start Trip) -> at_site (Reach Site) -> return (Complete Visit & Return) -> completed (End Trip)
export default function RoundTripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { activeTrip, updateTrip, addOutboundPoint, addReturnPoint } = useTrip();
  const [stage, setStage] = useState(() => deriveStageFromTrip(activeTrip));
  const stageRef = useRef('idle');
  const locationSubscriptionRef = useRef(null);
  const [region, setRegion] = useState(null);
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location access is needed to track your trip.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (update) => {
          // Reject fixes with poor accuracy — same threshold as the
          // background task.  Raw fixes > 30 m off inflate the route.
          if (update.coords.accuracy != null && update.coords.accuracy > 30) return;
          const point = { latitude: update.coords.latitude, longitude: update.coords.longitude };
          setRegion({ ...point, latitudeDelta: 0.02, longitudeDelta: 0.02 });
          // Feed the live map/polyline directly from this foreground watcher —
          // this is what makes pointers show up immediately and reliably
          // (works the same way v1's tracking did, and works under Expo Go
          // too, unlike the background TaskManager task below). The
          // background task keeps running purely as a durable backend-sync
          // path; see the reconciliation in handleReachSite/handleEndTrip.
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
      if (running) return; // already running, nothing to do
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
      // Shouldn't normally happen (NewTripScreen already requires this), but
      // starting tracking with no server-side trip id means the route can
      // never sync to the admin — worth one retry attempt here instead of
      // silently proceeding.
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
    // prepend any foreground-only points captured before the background
    // task started or after it stopped, so nothing is lost.
    const finalPoints = mergePoints(backgroundPoints, foregroundPoints);
    const distance = calculateRouteDistanceKm(finalPoints);
    await updateTrackingPhase('stay');
    updateTrip({
      status: 'at_site',
      siteReachedTime: new Date().toISOString(),
      outboundPoints: finalPoints,
      outboundDistanceKm: distance,
    });
    setStage('at_site');
  };

  const handleCompleteAndReturn = async () => {
    updateTrip({ status: 'returning', visitCompletedTime: new Date().toISOString() });
    setStage('returning');
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
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <LocationDisclosureModal 
        visible={showDisclosure} 
        onAccept={handleAcceptLocation} 
        onDecline={() => setShowDisclosure(false)} 
      />
      <View style={styles.mapWrap}>
        {region && (
          <OpenStreetMap
            center={region}
            outboundPoints={activeTrip.outboundPoints}
            returnPoints={activeTrip.returnPoints}
          />
        )}
      </View>

      <Card>
        <Text style={typography.h3}>{activeTrip.destination || 'Site'}</Text>
        <Text style={typography.caption}>Status: {stage.replace('_', ' ').toUpperCase()}</Text>

        {stage === 'idle' && <AppButton title="Start Trip" onPress={handleStartTrip} />}
        {stage === 'outbound' && <AppButton title="Reach Site" onPress={handleReachSite} />}
        {stage === 'at_site' && (
          <AppButton title="Complete Visit & Return" onPress={handleCompleteAndReturn} />
        )}
        {stage === 'returning' && <AppButton title="End Trip" variant="secondary" onPress={handleEndTrip} />}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1 },
});
