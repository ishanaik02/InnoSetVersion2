import api from './api';

// ─── Bills ───────────────────────────────────────────────────────────────────

export async function getBills(params = {}) {
  const { data } = await api.get('/bills', { params });
  return data;
}

export async function getPendingBills() {
  const { data } = await api.get('/bills/pending');
  return data;
}

export async function getBillById(id) {
  const { data } = await api.get(`/bills/${id}`);
  return data;
}

export async function createBill(payload) {
  const { data } = await api.post('/bills', payload);
  return data;
}

export async function updateBill(id, payload) {
  const { data } = await api.patch(`/bills/${id}`, payload);
  return data;
}

export async function deleteBill(id) {
  const { data } = await api.delete(`/bills/${id}`);
  return data;
}

export async function submitBill(id, remarks = '') {
  const { data } = await api.post(`/bills/${id}/submit`, { remarks });
  return data;
}

export async function approveBill(id, remarks = '') {
  const { data } = await api.post(`/bills/${id}/approve`, { remarks });
  return data;
}

export async function rejectBill(id, remarks) {
  const { data } = await api.post(`/bills/${id}/reject`, { remarks });
  return data;
}

export async function editBillAmounts(id, payload) {
  const { data } = await api.patch(`/bills/${id}/edit`, payload);
  return data;
}

export async function markBillPaid(id, remarks = '') {
  const { data } = await api.post(`/bills/${id}/pay`, { remarks });
  return data;
}

export async function getBillHistory(id) {
  const { data } = await api.get(`/bills/${id}/history`);
  return data;
}

export async function getBillPrint(id) {
  const { data } = await api.get(`/bills/${id}/print`);
  return data;
}
