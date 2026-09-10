import React, { createContext, useContext, useEffect, useState } from 'react';
import { loginRequest, logoutRequest, getStoredUser } from '../services/authService';
import { destroyTracking, initializeTracking } from '../services/backgroundLocationService';
import { submitPendingTrips } from '../services/tripService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredUser();
        if (stored) setUser(stored);
      } catch (e) {
        // Corrupted or unreadable stored session — treat as logged out
        // rather than leaving the app stuck on the loading spinner.
        console.warn('[Auth] Failed to restore stored user:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (user && ['service_engineer', 'engineer'].includes(user.role)) {
      initializeTracking();
      // Retry any trips that were completed while offline.
      submitPendingTrips();
    }
  }, [user]);

  const login = async (employeeId, password) => {
    setError(null);
    try {
      const data = await loginRequest(employeeId, password);
      setUser(data.user);
      return true;
    } catch (e) {
      setError(e?.response?.data?.message || 'Login failed. Check credentials.');
      return false;
    }
  };

  const logout = async () => {
    await destroyTracking();
    await logoutRequest();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
