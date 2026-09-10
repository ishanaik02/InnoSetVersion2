import api from './api';

export async function markAttendance(payload) {
  const { data } = await api.post('/attendance/mark', payload);
  return data;
}

export async function getTodayAttendance() {
  const { data } = await api.get('/attendance/today');
  return data;
}

export async function getMyAttendance(params = {}) {
  const { data } = await api.get('/attendance/me', { params });
  return data;
}

export async function getBranchAttendance(params = {}) {
  const { data } = await api.get('/attendance/branch', { params });
  return data;
}

export async function getAllAttendance(params = {}) {
  const { data } = await api.get('/attendance/all', { params });
  return data;
}

export async function getPendingAttendance(params = {}) {
  const { data } = await api.get('/attendance/pending', { params });
  return data;
}

export async function approveAttendance(id, remarks = '') {
  const { data } = await api.post(`/attendance/${id}/approve`, { remarks });
  return data;
}

export async function rejectAttendance(id, remarks) {
  const { data } = await api.post(`/attendance/${id}/reject`, { remarks });
  return data;
}

export async function bulkApproveAttendance(payload) {
  const { data } = await api.post('/attendance/bulk-approve', payload);
  return data;
}

export async function getAttendanceReport(params = {}) {
  const { data } = await api.get('/attendance/report', { params });
  return data;
}
