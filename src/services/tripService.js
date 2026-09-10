import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerUploadFunction } from './backgroundLocationService';

export const createTrip = (payload) => api.post('/trips', payload).then((r) => r.data);

export const updateTrip = (tripId, payload) =>
  api.patch(`/trips/${tripId}`, payload).then((r) => r.data);

export const getTrips = () => api.get('/trips').then((r) => r.data);

export const getTripById = (tripId) => api.get(`/trips/${tripId}`).then((r) => r.data);

export const submitTrip = (tripId) =>
  api.post(`/trips/${tripId}/submit`).then((r) => r.data);

export const deleteTrip = (tripId) =>
  api.delete(`/trips/${tripId}`).then((r) => r.data);

export const uploadLocationBatch = (tripId, points) =>
  api.post(`/trips/${tripId}/location/batch`, { points }).then((r) => r.data);

registerUploadFunction(uploadLocationBatch);

// Guesses a mime type from a file extension when the picker didn't already
// give us one (older Android gallery URIs sometimes omit it).
function guessMimeType(uriOrName) {
  const ext = (uriOrName || '').split('.').pop()?.toLowerCase();
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return map[ext] || 'image/jpeg';
}

/**
 * Uploads a receipt file (photo or PDF) to MongoDB via the backend.
 * `file` can be a plain uri string (legacy callers), or an object
 * { uri, mimeType, name } as returned by ImagePicker/DocumentPicker assets —
 * passing the real mimeType/name matters so a PDF ticket isn't stored (and
 * later previewed) as if it were a JPEG.
 * `extra` can include { amount, notes } which are stored alongside the file.
 */
export const uploadReceipt = (tripId, file, category, extra = {}) => {
  const uri = typeof file === 'string' ? file : file.uri;
  const name = (typeof file === 'object' && file.name) || `receipt_${Date.now()}`;
  const mimeType = (typeof file === 'object' && file.mimeType) || guessMimeType(name || uri);

  const formData = new FormData();
  formData.append('receipt', { uri, name, type: mimeType });
  formData.append('category', category); // 'ticket' | 'hotel' | 'food' | 'other'
  if (extra.amount !== undefined) formData.append('amount', String(extra.amount));
  if (extra.notes) formData.append('notes', extra.notes);

  return api
    .post(`/trips/${tripId}/receipts`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const getDashboardStats = () => api.get('/trips/stats').then((r) => r.data);

// ── Offline trip submission queue ──────────────────────────────────────────
// When the engineer completes a trip while offline, the full trip payload
// is stashed here.  On the next successful network connection the queue
// is drained automatically (called from initializeTracking).

const PENDING_TRIPS_KEY = '@trip_pending_submissions';

export async function savePendingTripSubmission(tripPayload) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TRIPS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push(tripPayload);
    await AsyncStorage.setItem(PENDING_TRIPS_KEY, JSON.stringify(list));
  } catch { /* non-fatal */ }
}

export async function getPendingTripSubmissionCount() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TRIPS_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}

export async function removePendingTripSubmission(tripId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TRIPS_KEY);
    if (!raw) return;
    const list = JSON.parse(raw).filter((t) => t.id !== tripId);
    if (list.length === 0) {
      await AsyncStorage.removeItem(PENDING_TRIPS_KEY);
    } else {
      await AsyncStorage.setItem(PENDING_TRIPS_KEY, JSON.stringify(list));
    }
  } catch { /* non-fatal */ }
}

/**
 * Retry every trip in the pending-submissions queue.  Each trip is
 * individually create/update/submit'd — if one fails it stays in the
 * queue for the next retry.
 */
export async function submitPendingTrips() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TRIPS_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (list.length === 0) return;

    const stillPending = [];
    for (const trip of list) {
      try {
        // If the trip was created locally (pendingSync), create it on the
        // server first so it gets a real server-side ID.
        let serverId = trip.id;
        if (trip.pendingSync) {
          const res = await createTrip({
            startLocation: trip.startLocation,
            destination: trip.destination,
            date: trip.date,
            tripType: trip.tripType,
            conveyance: trip.conveyance,
            isLocalVisit: !!trip.isLocalVisit,
            status: 'draft',
          });
          serverId = res?.trip?._id || res?._id;
          if (!serverId) throw new Error('No trip id returned');
        }

        await updateTrip(serverId, {
          outboundPoints: trip.outboundPoints || [],
          returnPoints: trip.returnPoints || [],
          outboundDistanceKm: trip.outboundDistanceKm,
          returnDistanceKm: trip.returnDistanceKm,
          startTime: trip.startTime,
          siteReachedTime: trip.siteReachedTime,
          visitCompletedTime: trip.visitCompletedTime,
          endTime: trip.endTime,
          ticketAmount: trip.ticketAmount || 0,
          isLocalVisit: !!trip.isLocalVisit,
          callerDetails: trip.callerDetails || {},
          engineerRemarks: trip.engineerRemarks || '',
          additionalKm: trip.additionalKm || 0,
          additionalKmReason: trip.additionalKmReason || '',
          taDaAmount: trip.taDaAmount || 0,
          daAmount: trip.daAmount || 0,
          stayExpensesTotal: trip.stayExpensesTotal || 0,
          grandTotal: trip.grandTotal || 0,
          status: 'completed',
        });
        await submitTrip(serverId);
      } catch {
        stillPending.push(trip);
      }
    }

    if (stillPending.length === 0) {
      await AsyncStorage.removeItem(PENDING_TRIPS_KEY);
    } else {
      await AsyncStorage.setItem(PENDING_TRIPS_KEY, JSON.stringify(stillPending));
    }
  } catch { /* non-fatal */ }
}
