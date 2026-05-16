import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToken,
  decodeTokenPayload,
  getAuthUser,
  getToken,
  getUser,
  hasRequiredRole,
  isAuthenticated,
  isTokenExpired,
  setUser,
  setToken,
  clearUser,
} from "./auth";

const toBase64Url = (obj) =>
  btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const createToken = (payload) => `header.${toBase64Url(payload)}.signature`;

describe("auth helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and clears token in sessionStorage", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    expect(sessionStorage.getItem("greenstore_token")).toBe("abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("clears token when setToken receives empty value", () => {
    setToken("abc");
    setToken("");
    expect(getToken()).toBeNull();
  });

  it("stores and clears current user", () => {
    setUser({ id: 1, role: "admin" });
    expect(getUser()).toMatchObject({ id: 1, role: "admin" });
    clearUser();
    expect(getUser()).toBeNull();
  });

  it("clears invalid persisted user json", () => {
    sessionStorage.setItem("greenstore_user", "{invalid-json");
    expect(getUser()).toBeNull();
    expect(sessionStorage.getItem("greenstore_user")).toBeNull();
  });

  it("decodes payload and exposes user info", () => {
    const token = createToken({
      id: 9,
      name: "Marina",
      email: "marina@example.com",
      role: "manager",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    setToken(token);
    expect(decodeTokenPayload(token)?.name).toBe("Marina");
    expect(getAuthUser()).toMatchObject({
      id: 9,
      role: "manager",
    });
  });

  it("marks expired token as unauthenticated", () => {
    const expired = createToken({
      id: 1,
      role: "operator",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    setToken(expired);
    expect(isTokenExpired(expired)).toBe(true);
    expect(isAuthenticated()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it("validates role hierarchy", () => {
    const token = createToken({
      id: 1,
      role: "manager",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    setToken(token);
    expect(hasRequiredRole("operator")).toBe(true);
    expect(hasRequiredRole("manager")).toBe(true);
    expect(hasRequiredRole("admin")).toBe(false);
  });
});
