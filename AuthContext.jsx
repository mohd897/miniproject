import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import api from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.data.user);
        setWallet(response.data.data.wallet);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Failed to fetch user", error);
      setIsAuthenticated(false);
      setUser(null);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = Cookies.get('accessToken');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.success) {
      const { accessToken, refreshToken, user: userData } = response.data.data;
      Cookies.set('accessToken', accessToken, { secure: true, sameSite: 'strict' });
      Cookies.set('refreshToken', refreshToken, { secure: true, sameSite: 'strict' });
      setUser(userData);
      setIsAuthenticated(true);
      await fetchUser(); // To load wallet as well
      return { success: true };
    }
    return { success: false, message: response.data.message };
  };

  const register = async (userData) => {
    const response = await api.post('/auth/register', userData);
    if (response.data.success) {
      return { success: true };
    }
    return { success: false, message: response.data.message };
  };

  const simpleLogin = async (username) => {
    const response = await api.post('/auth/simple-login', { username });
    if (response.data.success) {
      const { accessToken, refreshToken, user: userData } = response.data.data;
      Cookies.set('accessToken', accessToken, { secure: true, sameSite: 'strict' });
      Cookies.set('refreshToken', refreshToken, { secure: true, sameSite: 'strict' });
      setUser(userData);
      setIsAuthenticated(true);
      await fetchUser(); // To load wallet as well
      return { success: true };
    }
    return { success: false, message: response.data.message };
  };

  const logout = async () => {
    try {
      const refreshToken = Cookies.get('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      Cookies.remove('accessToken');
      Cookies.remove('refreshToken');
      setUser(null);
      setWallet(null);
      setIsAuthenticated(false);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, wallet, isAuthenticated, loading, simpleLogin, login, register, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
