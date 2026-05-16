import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Verificar se usuário está autenticado ao montar
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('greenstore_token');
        if (!token) {
          setLoading(false);
          return;
        }

        // Tentar recuperar usuário do localStorage primeiro para renderização rápida
        const savedUser = localStorage.getItem('greenstore_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }

        // Verificar se token ainda é válido em segundo plano
        const response = await apiFetch('/auth/me');
        setUser(response);
        localStorage.setItem('greenstore_user', JSON.stringify(response));
      } catch (err) {
        console.error('Erro na verificação de autenticação:', err);
        localStorage.removeItem('greenstore_token');
        localStorage.removeItem('greenstore_refresh_token');
        localStorage.removeItem('greenstore_user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Login
  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem('greenstore_token', response.accessToken);
      localStorage.setItem('greenstore_refresh_token', response.refreshToken);
      localStorage.setItem('greenstore_user', JSON.stringify(response.user));
      setUser(response.user);
      navigate('/caixa');
      return response;
    } catch (err) {
      setError(err.message || 'Falha ao fazer login');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    } finally {
      localStorage.removeItem('greenstore_token');
      localStorage.removeItem('greenstore_refresh_token');
      localStorage.removeItem('greenstore_user');
      setUser(null);
      navigate('/');
    }
  }, [navigate]);

  // Renovar token
  const refreshToken = useCallback(async () => {
    try {
      const refreshTokenValue = localStorage.getItem('greenstore_refresh_token');
      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }

      const response = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      localStorage.setItem('greenstore_token', response.accessToken);
      if (response.refreshToken) {
        localStorage.setItem('greenstore_refresh_token', response.refreshToken);
      }

      return response.accessToken;
    } catch (err) {
      // Se refresh falhar, fazer logout
      await logout();
      throw err;
    }
  }, [logout]);

  // Verificar se usuário tem permissão
  const hasRole = useCallback((role) => {
    if (!user) return false;
    const roles = {
      operator: 1,
      supervisor: 2,
      manager: 3,
      admin: 4,
    };
    return roles[user.role] >= roles[role];
  }, [user]);

  // Verificar se usuário tem permissão exata
  const hasExactRole = useCallback((role) => {
    return user?.role === role;
  }, [user]);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    refreshToken,
    hasRole,
    hasExactRole,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
