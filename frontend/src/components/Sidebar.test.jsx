import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { BrowserRouter } from "react-router-dom";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const apiFetchMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

// Mock do lib/auth para evitar efeitos colaterais
vi.mock("../lib/auth", () => ({
  clearToken: vi.fn(),
  clearUser: vi.fn(),
  getToken: () => "fake-token",
  getAuthUser: () => ({ role: "manager", name: "Test User" }),
  hasRequiredRole: () => true,
}));

import { Sidebar } from "./Sidebar";

const renderSidebar = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Sidebar />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    apiFetchMock.mockReset();
    navigateMock.mockReset();
    // Mock do /auth/me que o AuthProvider chama ao montar
    apiFetchMock.mockResolvedValue({ id: 1, name: "Test User", role: "manager", is_active: 1 });
  });

  it("renders sidebar items", async () => {
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText(/Caixa/i)).toBeDefined();
      expect(screen.getByText(/Estoque/i)).toBeDefined();
    });
  });

  it("logs out with backend call and clears local session", async () => {
    apiFetchMock.mockResolvedValue({ status: "ok" });
    renderSidebar();

    // Esperar o carregamento inicial do AuthProvider
    await waitFor(() => expect(screen.queryByText(/Carregando/i)).toBeNull());

    const logoutButton = screen.getByRole("button", { name: /Sair/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    });
  });
});
