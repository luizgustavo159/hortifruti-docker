import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock das páginas para evitar renderização pesada
vi.mock("./pages/Login", () => ({ Login: () => <div>login-page</div> }));
vi.mock("./pages/Caixa", () => ({ Caixa: () => <div>caixa-page</div> }));
vi.mock("./pages/Estoque", () => ({ Estoque: () => <div>estoque-page</div> }));
vi.mock("./pages/Descontos", () => ({ Descontos: () => <div>descontos-page</div> }));
vi.mock("./pages/AdminDashboard", () => ({ AdminDashboard: () => <div>admin-page</div> }));
vi.mock("./pages/AdminLogs", () => ({ AdminLogs: () => <div>admin-logs-page</div> }));
vi.mock("./pages/AdminPerfil", () => ({ AdminPerfil: () => <div>admin-perfil-page</div> }));
vi.mock("./pages/AdminPoliticas", () => ({ AdminPoliticas: () => <div>admin-politicas-page</div> }));
vi.mock("./pages/AdminRelatorios", () => ({ AdminRelatorios: () => <div>admin-relatorios-page</div> }));
vi.mock("./pages/AdminFuncionarios", () => ({ AdminFuncionarios: () => <div>admin-funcionarios-page</div> }));
vi.mock("./pages/AdminConfiguracao", () => ({ AdminConfiguracao: () => <div>admin-config-page</div> }));

const mockApiFetch = vi.fn();
vi.mock("./lib/api", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// Mock do auth helpers
const authState = {
  token: null,
  user: null,
};

vi.mock("./lib/auth", () => ({
  getToken: () => authState.token,
  getUser: () => authState.user,
  setUser: (u) => { authState.user = u; },
  setToken: (t) => { authState.token = t; },
  clearToken: () => { authState.token = null; },
  clearUser: () => { authState.user = null; },
  isAuthenticated: () => !!authState.token,
  hasRequiredRole: (role) => {
    if (!role) return true;
    const levels = { operator: 1, manager: 3, admin: 4 };
    return (levels[authState.user?.role] || 0) >= (levels[role] || 0);
  }
}));

import App from "./App";

describe("App session bootstrap", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    authState.token = null;
    authState.user = null;
    mockApiFetch.mockReset();
    sessionStorage.clear();
  });

  it("shows login when user is not authenticated", async () => {
    render(<App />);
    expect(await screen.findByText("login-page")).toBeTruthy();
  });

  it("loads profile from /auth/me when token exists", async () => {
    authState.token = "fake-token";
    mockApiFetch.mockResolvedValue({ id: 1, name: "Admin", role: "admin" });

    render(<App />);
    
    // O AuthProvider deve chamar /auth/me
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/auth/me"));
    
    // Após carregar, deve redirecionar para caixa (rota padrão logado)
    expect(await screen.findByText("caixa-page")).toBeTruthy();
  });

  it("redirects to /caixa when accessing admin route with operator role", async () => {
    authState.token = "fake-token";
    authState.user = { id: 2, name: "Op", role: "operator" };
    window.history.pushState({}, "", "/admin");

    render(<App />);
    
    // Deve ser barrado pelo ProtectedRoute e ir para /caixa
    expect(await screen.findByText("caixa-page")).toBeTruthy();
  });
});
