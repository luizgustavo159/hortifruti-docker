import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getDefaultRoute, hasRequiredRole as checkRequiredRole } from '../lib/auth';

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
        const token = sessionStorage.getItem('greenstore_token');
        if (!token) {
          setLoading(false);
          return;
        }

        // Tentar recuperar usuário do sessionStorage primeiro para renderização rápida
        const savedUser = sessionStorage.getItem('greenstore_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }

        // Verificar se token ainda é válido em segundo plano
        const response = await apiFetch('/auth/me');
        setUser(response);
        sessionStorage.setItem('greenstore_user', JSON.stringify(response));
      } catch (err) {
        console.error('Erro na verificação de autenticação:', err);
        sessionStorage.removeItem('greenstore_token');
        sessionStorage.removeItem('greenstore_refresh_token');
        sessionStorage.removeItem('greenstore_user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Implementar expiração por inatividade (1 hora)
  useEffect(() => {
    if (!user) return;

    let timeout;
    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        logout();
        alert("Sua sessão expirou por inatividade.");
      }, 60 * 60 * 1000); // 1 hora
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timeout) clearTimeout(timeout);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user]);

  // Login
  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      sessionStorage.setItem('greenstore_token', response.accessToken);
      sessionStorage.setItem('greenstore_refresh_token', response.refreshToken);
      sessionStorage.setItem('greenstore_user', JSON.stringify(response.user));
      setUser(response.user);
      // Redirecionar para a rota padrão do usuário baseado no seu role
      const defaultRoute = getDefaultRoute();
      navigate(defaultRoute);
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
      sessionStorage.removeItem('greenstore_token');
      sessionStorage.removeItem('greenstore_refresh_token');
      sessionStorage.removeItem('greenstore_user');
      setUser(null);
      window.location.href = '/';
    }
  }, []);

  // Renovar token
  const refreshToken = useCallback(async () => {
    try {
      const refreshTokenValue = sessionStorage.getItem('greenstore_refresh_token');
      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }

      const response = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      sessionStorage.setItem('greenstore_token', response.accessToken);
      if (response.refreshToken) {
        sessionStorage.setItem('greenstore_refresh_token', response.refreshToken);
      }

      return response.accessToken;
    } catch (err) {
      // Se refresh falhar, fazer logout
      await logout();
      throw err;
    }
  }, [logout]);

  // Verificar se usuário tem permissão (usa a lógica unificada de lib/auth.js)
  const hasRole = useCallback((role) => {
    if (!user) return false;
    const roles = {
      operator: 1,
      supervisor: 2,
      manager: 3,
      admin: 4,
    };
    const userLevel = roles[user.role] || 0;
    const requiredLevel = roles[role] || Number.MAX_SAFE_INTEGER;
    return userLevel >= requiredLevel;
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
