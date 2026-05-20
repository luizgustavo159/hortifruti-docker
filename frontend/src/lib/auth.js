const TOKEN_KEY = "greenstore_token";
const USER_KEY = "greenstore_user";
// Hierarquia de roles: cada nível superior tem acesso a tudo do nível inferior
const roleLevels = {
  operator: 1,
  supervisor: 2,
  manager: 3,
  admin: 4,
};

// Definição de permissões específicas por role (para controle granular)
const rolePermissions = {
  operator: ['caixa', 'estoque'],
  supervisor: ['caixa', 'estoque', 'descontos', 'admin', 'relatorios', 'logs'],
  manager: ['caixa', 'estoque', 'descontos', 'admin', 'relatorios', 'logs'],
  admin: ['caixa', 'estoque', 'descontos', 'admin', 'relatorios', 'logs', 'funcionarios', 'configuracao'],
};

// Rota padrão para cada role após login
const defaultRoutes = {
  operator: '/caixa',
  supervisor: '/admin',
  manager: '/admin',
  admin: '/admin',
};

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (!token) {
    clearToken();
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
};

export const getUser = () => {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    clearUser();
    return null;
  }
};

export const setUser = (user) => {
  if (!user) {
    return;
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearUser = () => {
  sessionStorage.removeItem(USER_KEY);
};

export const decodeTokenPayload = (token) => {
  if (!token) {
    return null;
  }
  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) {
      return null;
    }
    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized.padEnd(normalized.length + padLength, "=");
    const payload = JSON.parse(atob(padded));
    return payload;
  } catch (_error) {
    return null;
  }
};

export const isTokenExpired = (token) => {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) {
    return false;
  }
  return payload.exp * 1000 <= Date.now();
};

export const getAuthUser = () => {
  const persistedUser = getUser();
  if (persistedUser?.role) {
    return persistedUser;
  }
  const token = getToken();
  const payload = decodeTokenPayload(token);
  if (!payload) {
    return null;
  }
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    role: payload.role || "operator",
  };
};

export const hasRequiredRole = (requiredRole) => {
  if (!requiredRole) {
    return true;
  }
  const user = getAuthUser();
  const currentLevel = roleLevels[user?.role] || 0;
  const requiredLevel = roleLevels[requiredRole] || Number.MAX_SAFE_INTEGER;
  return currentLevel >= requiredLevel;
};

// Verificar se o usuário tem uma permissão específica
export const hasPermission = (permission) => {
  const user = getAuthUser();
  if (!user?.role) return false;
  const permissions = rolePermissions[user.role] || [];
  return permissions.includes(permission);
};

// Obter a rota padrão para o usuário
export const getDefaultRoute = () => {
  const user = getAuthUser();
  if (!user?.role) return '/';
  return defaultRoutes[user.role] || '/caixa';
};

export const isAuthenticated = () => {
  const token = getToken();
  if (!token) {
    return false;
  }
  if (isTokenExpired(token)) {
    clearToken();
    clearUser();
    return false;
  }
  return true;
};
