import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import { getToken } from '../utils/tokenStorage';

// Deployed backend on Railway (MongoDB Atlas as the database).
// Overridable per EAS build profile via EXPO_PUBLIC_API_URL (see eas.json) —
// e.g. point a "preview" build at a staging backend without editing code.
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://innosetbackend-production.up.railway.app/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// React Native's <Image> component can't attach an Authorization header
// directly, so instead of putting the bearer token in the URL as a ?token=
// query param (which can leak via server access logs, proxy logs, or crash/
// analytics tooling that captures URLs), we download the file ourselves
// with the token in a proper header and cache it locally. <Image> then
// loads the local file:// URI, never the remote one.
export async function getReceiptUri(tripId, receiptId) {
  const localUri = `${FileSystem.cacheDirectory}receipt_${tripId}_${receiptId}`;
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists) return localUri;

  const token = await getToken();
  const remoteUrl = `${BASE_URL}/trips/${tripId}/receipts/${receiptId}`;
  const result = await FileSystem.downloadAsync(remoteUrl, localUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return result.uri;
}

export default api;
