import api from './api';

export async function getBranches() {
  const { data } = await api.get('/branches');
  return data;
}

export async function getBranchById(id) {
  const { data } = await api.get(`/branches/${id}`);
  return data;
}

export async function getBranchStats(id) {
  const { data } = await api.get(`/branches/${id}/stats`);
  return data;
}

export async function createBranch(payload) {
  const { data } = await api.post('/branches', payload);
  return data;
}

export async function updateBranch(id, payload) {
  const { data } = await api.patch(`/branches/${id}`, payload);
  return data;
}
