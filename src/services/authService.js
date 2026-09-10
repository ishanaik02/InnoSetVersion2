import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { setToken, clearToken } from '../utils/tokenStorage';

export async function loginRequest(employeeId, password) {
  const { data } = await api.post('/auth/login', { employeeId, password });
  // Expected response: { token, user: { id, name, employeeId } }
  await setToken(data.token);
  await AsyncStorage.setItem('authUser', JSON.stringify(data.user));
  return data;
}

export async function logoutRequest() {
  await clearToken();
  await AsyncStorage.removeItem('authUser');
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem('authUser');
  return raw ? JSON.parse(raw) : null;
}
