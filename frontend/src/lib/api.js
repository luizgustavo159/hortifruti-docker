import { clearToken, clearUser, getToken } from "./auth";

const API_BASE = "/api";

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  const isSearchParamsBody = typeof URLSearchParams !== "undefined" && options.body instanceof URLSearchParams;
  const isBlobBody = typeof Blob !== "undefined" && options.body instanceof Blob;
  if (
    hasBody &&
    !headers["Content-Type"] &&
    !headers["content-type"] &&
    !isFormDataBody &&
    !isSearchParamsBody &&
    !isBlobBody
  ) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      clearUser();
    }
    let message = data?.message;
    
    // Suporte para erros de validação do Zod (backend middleware)
    if (!message && data?.details && Array.isArray(data.details)) {
      message = data.details.map(d => `${d.field}: ${d.message}`).join(", ");
    }
    
    // Suporte para outros formatos de erro de validação
    if (!message && data?.errors && Array.isArray(data.errors)) {
      message = data.errors.map(e => e.msg || e.message).join(" ");
    }
    
    if (!message) message = data?.error || "Erro na requisição.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
