import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TripContext = createContext(null);

const TRIP_STORAGE_KEY = '@trip_active_context';

// Fields that are persisted to AsyncStorage.  The large points arrays
// (outboundPoints / returnPoints) are deliberately excluded — they are
// already stored by the background-location service's route history, and
// persisting them on every point addition would be expensive.
const PERSISTED_FIELDS = [
  'id', 'startLocation', 'destination', 'date', 'tripType', 'conveyance',
  'isLocalVisit', 'status', 'outboundDistanceKm', 'returnDistanceKm',
  'startTime', 'siteReachedTime', 'visitCompletedTime', 'endTime',
  'ticketAmount', 'stayExpenses', 'receipts', 'callerDetails',
  'engineerRemarks', 'additionalKm', 'additionalKmReason', 'pendingSync',
];

const initialTripState = {
  id: null,
  startLocation: null,
  destination: null,
  date: null,
  tripType: null, // 'round' | 'stay'
  conveyance: null, // 'bike' | 'car' | 'bus' | 'train'
  isLocalVisit: false,
  status: 'draft', // draft -> in_progress -> at_site -> returning -> completed -> submitted
  outboundPoints: [],
  returnPoints: [],
  outboundDistanceKm: 0,
  returnDistanceKm: 0,
  startTime: null,
  siteReachedTime: null,
  visitCompletedTime: null,
  endTime: null,
  receipts: [], // { uri, category, amount }
  ticketAmount: 0, // for bus/train
  stayExpenses: [], // { type: 'hotel'|'food'|'other', amount, notes, uri }
  callerDetails: { callerName: '' },
  engineerRemarks: '',
  additionalKm: 0,
  additionalKmReason: '',
  pendingSync: false,
};

/** Extract only the fields we want to persist (avoids storing huge point arrays). */
function pickPersistable(trip) {
  const out = {};
  for (const key of PERSISTED_FIELDS) {
    if (trip[key] !== undefined) out[key] = trip[key];
  }
  return out;
}

async function saveTripToDisk(trip) {
  try {
    await AsyncStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(pickPersistable(trip)));
  } catch {
    // Storage full or unavailable — non-fatal.
  }
}

async function loadTripFromDisk() {
  try {
    const raw = await AsyncStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Only restore if the trip was actually in progress (not draft or already submitted).
    if (saved.status === 'draft' || saved.status === 'submitted' || saved.status === 'completed') return null;
    return saved;
  } catch {
    return null;
  }
}

export function TripProvider({ children }) {
  const [activeTrip, setActiveTrip] = useState(initialTripState);
  const [tripLoaded, setTripLoaded] = useState(false);
  const isInitialMount = useRef(true);

  // Restore active trip from AsyncStorage on mount (survives app kills).
  useEffect(() => {
    (async () => {
      const saved = await loadTripFromDisk();
      if (saved) {
        // Points arrays come from the background service route history,
        // not from the persisted context (they were excluded to avoid
        // storing large arrays on every point addition).
        setActiveTrip({ ...initialTripState, ...saved, outboundPoints: [], returnPoints: [] });
      }
      setTripLoaded(true);
    })();
  }, []);

  // Persist trip metadata to AsyncStorage on every update (debounced to
  // avoid excessive writes during rapid point additions).
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!tripLoaded) return;
    // Clear the trip context when status reaches terminal states.
    if (activeTrip.status === 'submitted') {
      AsyncStorage.removeItem(TRIP_STORAGE_KEY);
      return;
    }
    // Debounce: coalesce rapid updates into a single disk write.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveTripToDisk(activeTrip), 500);
    return () => clearTimeout(saveTimer.current);
  }, [activeTrip, tripLoaded]);

  const updateTrip = (updates) => {
    setActiveTrip((prev) => ({ ...prev, ...updates }));
  };

  const addOutboundPoint = (point) => {
    setActiveTrip((prev) => ({ ...prev, outboundPoints: [...prev.outboundPoints, point] }));
  };

  const addReturnPoint = (point) => {
    setActiveTrip((prev) => ({ ...prev, returnPoints: [...prev.returnPoints, point] }));
  };

  const addReceipt = (receipt) => {
    setActiveTrip((prev) => ({ ...prev, receipts: [...prev.receipts, receipt] }));
  };

  const addStayExpense = (expense) => {
    setActiveTrip((prev) => ({ ...prev, stayExpenses: [...prev.stayExpenses, expense] }));
  };

  // Patches the most recently added expense matching `uri` once its receipt
  // upload to the backend (MongoDB) resolves — records the receiptId (or an
  // uploadFailed flag so TripSummaryScreen can retry at submit time).
  const updateStayExpenseByUri = (uri, patch) => {
    setActiveTrip((prev) => ({
      ...prev,
      stayExpenses: prev.stayExpenses.map((e) => (e.uri === uri ? { ...e, ...patch } : e)),
    }));
  };

  const resetTrip = () => {
    setActiveTrip(initialTripState);
    AsyncStorage.removeItem(TRIP_STORAGE_KEY);
  };

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        tripLoaded,
        updateTrip,
        addOutboundPoint,
        addReturnPoint,
        addReceipt,
        addStayExpense,
        updateStayExpenseByUri,
        resetTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export const useTrip = () => useContext(TripContext);
