import { NavLink, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { clearToken, clearUser, getAuthUser, hasRequiredRole } from "../lib/auth";

const navItems = [
  { to: "/caixa", label: "Caixa" },
  { to: "/estoque", label: "Estoque" },
  { to: "/descontos", label: "Descontos" },
  { to: "/admin", label: "Dashboard Admin" },
  { to: "/admin/advanced", label: "Dashboard Avançado" },
  { to: "/admin/funcionarios", label: "Funcionários" },
  { to: "/admin/logs", label: "Logs" },
  { to: "/admin/configuracao", label: "Configurações" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const user = getAuthUser() || { name: "Admin Demo", role: "admin" };
  const items = navItems;

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch (_error) {
      // Mesmo se a sessão já estiver inválida no backend, limpamos o estado local.
    } finally {
      clearToken();
      clearUser();
      navigate("/", { replace: true });
    }
  };

  return (
    <aside className="sidebar">
      <div>
        <h1>GreenStore Pro</h1>
        <p>Operação inteligente</p>
      </div>
      <nav>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div>
        <span className="badge">{user?.role || "sem sessão"}</span>
        <button className="button" onClick={logout} style={{ marginTop: "12px", width: "100%" }} type="button">
          Sair
        </button>
      </div>
    </aside>
  );
}
