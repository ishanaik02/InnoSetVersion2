import api, { BASE_URL, getReceiptUri } from './api';

export { getReceiptUri };

export const getOverview = () => api.get('/admin/overview').then((r) => r.data);

export const getEngineers = () => api.get('/admin/engineers').then((r) => r.data);

export const createEngineer = (payload) => api.post('/admin/engineers', payload).then((r) => r.data);

// There's no self-service "forgot password" — the admin sets a new one and
// shares it with the engineer out-of-band, same as account creation.
export const resetEngineerPassword = (engineerId, password) =>
  api.patch(`/admin/engineers/${engineerId}/reset-password`, { password }).then((r) => r.data);

export const getAllTrips = (filters = {}) =>
  api.get('/admin/trips', { params: filters }).then((r) => r.data);

export const getTripDetail = (tripId) => api.get(`/admin/trips/${tripId}`).then((r) => r.data);

export const reviewTrip = (tripId, decision, note, amount) =>
  api.patch(`/admin/trips/${tripId}/review`, { decision, note, amount }).then((r) => r.data);

export const deleteTrip = (tripId) => api.delete(`/admin/trips/${tripId}`).then((r) => r.data);
