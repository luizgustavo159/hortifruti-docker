import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { getAuthUser } from "../lib/auth";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { RelogioGlobal } from "./RelogioGlobal";
import { Leaf } from "lucide-react";

// Definição de abas por role - cada role vê apenas o que está permitido
const getNavItemsByRole = (role) => {
  const baseItems = {
    operator: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/caderneta", label: "Caderneta" },
    ],
    supervisor: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/caderneta", label: "Caderneta" },
      { to: "/descontos", label: "Descontos" },
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/relatorios", label: "Relatórios" },
      { to: "/admin/logs", label: "Logs de Auditoria" },
    ],
    manager: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/caderneta", label: "Caderneta" },
      { to: "/descontos", label: "Descontos" },
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/relatorios", label: "Relatórios" },
      { to: "/admin/logs", label: "Logs de Auditoria" },
    ],
    admin: [
      { to: "/caixa", label: "Caixa PDV" },
      { to: "/estoque", label: "Estoque" },
      { to: "/caderneta", label: "Caderneta" },
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
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const data = await apiFetch("/alerts");
        setAlerts(data || []);
      } catch (err) {
        console.error("Erro ao carregar alertas:", err);
      }
    };
    checkAlerts();
    const interval = setInterval(checkAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);
  
  // Obter itens de navegação específicos para o role do usuário
  const items = getNavItemsByRole(user?.role || 'operator');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon-small-container">
          <Leaf size={24} className="logo-icon-small" />
        </div>
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
              style={{ position: 'relative' }}
            >
              {item.label}
              {item.to === "/estoque" && alerts.length > 0 && (
                <span style={{ 
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'var(--danger)', color: 'white', fontSize: '10px', fontWeight: 'bold',
                  padding: '2px 6px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  {alerts.length}
                </span>
              )}
            </NavLink>
          ))
        ) : (
          <p className="no-items">Nenhuma aba disponível</p>
        )}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <ThemeSwitcher />
          <RelogioGlobal />
        </div>
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
