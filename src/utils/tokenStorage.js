import * as SecureStore from 'expo-secure-store';

/**
 * The JWT auth token is the one piece of app state that grants API access,
 * so it lives in SecureStore (Keychain on iOS, Keystore-backed encrypted
 * storage on Android) instead of plain AsyncStorage. AsyncStorage is
 * unencrypted on disk — readable via an adb backup on a non-rooted device,
 * trivially readable on a rooted/jailbroken one. Everything else non-secret
 * (cached user profile, active trip draft) can stay in AsyncStorage.
 */
const TOKEN_KEY = 'authToken';

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function setToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
