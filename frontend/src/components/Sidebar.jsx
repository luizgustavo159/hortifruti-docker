import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAuthUser } from "../lib/auth";
import { ThemeSwitcher } from "./ThemeSwitcher";

// Definição de abas por role - cada role vê apenas o que está permitido
const getNavItemsByRole = (role) => {
  const baseItems = {
    operator: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
    ],
    supervisor: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/descontos", label: "Descontos" },
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/relatorios", label: "Relatórios" },
      { to: "/admin/logs", label: "Logs de Auditoria" },
    ],
    manager: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/descontos", label: "Descontos" },
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/relatorios", label: "Relatórios" },
      { to: "/admin/logs", label: "Logs de Auditoria" },
    ],
    admin: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/descontos", label: "Descontos" },
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/relatorios", label: "Relatórios" },
      { to: "/admin/funcionarios", label: "Funcionários" },
      { to: "/admin/logs", label: "Logs de Auditoria" },
      { to: "/admin/configuracao", label: "Configurações" },
    ],
  };
  return baseItems[role] || baseItems.operator;
};

export function Sidebar() {
  const { logout } = useAuth();
  const user = getAuthUser();
  
  // Obter itens de navegação específicos para o role do usuário
  const items = getNavItemsByRole(user?.role || 'operator');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon-small">🌿</div>
        <div>
          <h1>GreenStore</h1>
          <p>Painel de Controle</p>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        {items.length > 0 ? (
          items.map((item) => (
            <NavLink 
              key={item.to} 
              to={item.to} 
              className={({ isActive }) => (isActive ? "active" : undefined)}
              end={item.to === "/admin"}
            >
              {item.label}
            </NavLink>
          ))
        ) : (
          <p className="no-items">Nenhuma aba disponível</p>
        )}
      </nav>

      <div className="sidebar-footer">
        <ThemeSwitcher />
        <div className="user-info">
          <span className="user-role-badge">{user?.role || "operador"}</span>
          <p className="user-name">{user?.name || "Usuário"}</p>
        </div>
        <button className="logout-button" onClick={logout} type="button">
          Sair do Sistema
        </button>
      </div>
    </aside>
  );
}
