import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { clearToken, getToken, getUser, setToken, setUser } from "./auth";

describe("apiFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearToken();
  });

  it("sends authorization header when token exists", async () => {
    setToken("jwt-token");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    const data = await apiFetch("/health");
    expect(data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
        }),
      })
    );
  });

  it("does not force json content-type on requests without body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    await apiFetch("/health");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "Content-Type": expect.anything(),
        }),
      })
    );
  });

  it("throws backend message for non-2xx responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ message: "Credenciais inválidas." }),
    });

    await expect(apiFetch("/auth/login", { method: "POST" })).rejects.toThrow("Credenciais inválidas.");
  });

  it("exposes response status in thrown errors", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "Sem permissão." }),
    });

    await expect(apiFetch("/admin")).rejects.toMatchObject({
      message: "Sem permissão.",
      status: 403,
    });
  });

  it("clears local session on 401", async () => {
    setToken("jwt-token");
    setUser({ id: 1, role: "operator" });
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "Sessão expirada." }),
    });

    await expect(apiFetch("/auth/me")).rejects.toThrow("Sessão expirada.");
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});
