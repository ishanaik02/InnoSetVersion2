import api from './api';

export async function getUsers(params = {}) {
  const { data } = await api.get('/users', { params });
  return data;
}

export async function getUserById(id) {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

export async function createUser(payload) {
  const { data } = await api.post('/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.patch(`/users/${id}`, payload);
  return data;
}

export async function resetUserPassword(id, password) {
  const { data } = await api.patch(`/users/${id}/reset-password`, { password });
  return data;
}

export async function getDashboardStats() {
  const { data } = await api.get('/dashboard/stats');
  return data;
}
