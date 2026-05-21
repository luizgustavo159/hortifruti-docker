import { useState, useEffect, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminLogs.css";

// Mapeamento de ações técnicas para descrições amigáveis
const ACTION_DESCRIPTIONS = {
  "venda_realizada": "Venda Realizada",
  "venda_cancelada": "Venda Cancelada",
  "reembolso_processado": "Reembolso Processado",
  "ajuste_estoque": "Ajuste de Estoque",
  "estoque_recebido": "Estoque Recebido",
  "perda_estoque": "Perda de Estoque",
  "movimentacao_estoque": "Movimentação de Estoque",
  "produto_criado": "Produto Cadastrado",
  "produto_atualizado": "Produto Atualizado",
  "produto_deletado": "Produto Removido",
  "categoria_criada": "Categoria Criada",
  "fornecedor_cadastrado": "Fornecedor Cadastrado",
  "pedido_compra_criado": "Pedido de Compra Criado",
  "pedido_compra_aprovado": "Pedido de Compra Aprovado",
  "pedido_compra_recebido": "Pedido de Compra Recebido",
  "usuario_criado": "Usuário Criado",
  "usuario_atualizado": "Usuário Atualizado",
  "usuario_deletado": "Usuário Deletado",
  "senha_redefinida": "Senha Redefinida",
  "login_sucesso": "Login Bem-sucedido",
  "login_falha": "Falha de Login",
  "desconto_criado": "Desconto Criado",
  "desconto_atualizado": "Desconto Atualizado",
  "desconto_deletado": "Desconto Deletado",
  "aprovacao_solicitada": "Aprovação Solicitada",
  "aprovacao_concedida": "Aprovação Concedida",
  "aprovacao_negada": "Aprovação Negada",
  "configuracoes_alteradas": "Configurações Alteradas",
  "inicializacao_admin": "Sistema Inicializado",
  "caixa_aberto": "Abertura de Caixa",
  "caixa_fechado": "Fechamento de Caixa",
  "movimentacao_caixa": "Movimentação de Caixa",
  "tentativa_venda_caixa_fechado": "Tentativa de Venda (Caixa Fechado)",
  "erro_sistema": "Erro de Sistema (5xx)",
  "erro_cliente": "Erro de Cliente (4xx)",
  "excecao_nao_tratada": "Exceção Não Tratada",
  "erro_migracao": "Erro de Migração",
  "erro_seed": "Erro de Seed",
  "erro_fatal_inicializacao": "Erro Fatal na Inicialização",
  "solicitacao_recuperacao_senha": "Solicitação de Recuperação de Senha",
  "recuperacao_senha_concluida": "Recuperação de Senha Concluída",
  "item_removido": "Item Removido do Carrinho",
  "desconto_manual_autorizado": "Desconto Manual Autorizado",
  "fluxo_caixa_registrado": "Fluxo de Caixa Registrado",
  "conta_financeira_criada": "Conta Financeira Criada",
  "conta_financeira_liquidada": "Conta Financeira Liquidada"
};

const getActionDescription = (action) => {
  return ACTION_DESCRIPTIONS[action] || action || "Ação Desconhecida";
};

const getActionIcon = (action) => {
  if (action.includes("sale")) return "💰";
  if (action.includes("stock")) return "📦";
  if (action.includes("user")) return "👤";
  if (action.includes("auth") || action.includes("login")) return "🔐";
  if (action.includes("discount")) return "🏷️";
  if (action.includes("approval")) return "✅";
  if (action.includes("settings")) return "⚙️";
  return "📋";
};

const formatDetails = (details, action) => {
  if (!details) return "Sem detalhes adicionais";
  
  try {
    const parsed = typeof details === "string" ? JSON.parse(details) : details;
    
    // Criar descrição amigável baseada na ação
    if (action === "venda_realizada") {
      const id = parsed.id || (parsed.sale_ids ? parsed.sale_ids.join(",") : "N/A");
      const itemsCount = parsed.items_count || (parsed.items ? parsed.items.length : "N/A");
      const totalVal = parsed.final_total || parsed.total || 0;
      return `VENDA #${id} | Total: R$ ${Number(totalVal).toFixed(2)} | Itens: ${itemsCount} | Pagto: ${parsed.payment_method || "N/A"}`;
    }
    if (action === "perda_estoque") {
      return `PERDA: ${parsed.product_name || "N/A"} | Qtd: ${parsed.quantity} | Motivo: ${parsed.reason || "N/A"} | Estoque: ${parsed.prev_stock} -> ${parsed.next_stock}`;
    }
    if (action === "ajuste_estoque") {
      const type = Number(parsed.delta) > 0 ? "ENTRADA" : "SAÍDA";
      return `${type}: ${parsed.product_name || "N/A"} | Qtd: ${Math.abs(parsed.delta)} | Motivo: ${parsed.reason || "N/A"} | Estoque: ${parsed.prev_stock} -> ${parsed.next_stock}`;
    }
    if (action.includes("stock")) {
      return `Produto: ${parsed.product_name || "N/A"} | Quantidade: ${parsed.quantity || parsed.delta || "N/A"}`;
    }
    if (action.includes("user")) {
      return `Usuário: ${parsed.email || parsed.name || "N/A"} | Perfil: ${parsed.role || "N/A"}`;
    }
    if (action.includes("discount")) {
      return `Desconto: ${parsed.name || "N/A"} | Tipo: ${parsed.type || "N/A"} | Valor: ${parsed.value || "N/A"}`;
    }
    if (action.includes("approval")) {
      return `Pedido ID: ${parsed.id || "N/A"} | Status: ${parsed.status || "N/A"}`;
    }
    
    // Fallback: mostrar principais campos
    const keys = Object.keys(parsed).slice(0, 2);
    return keys.map(k => `${k}: ${parsed[k]}`).join(" | ") || "Sem detalhes";
  } catch {
    return details;
  }
};

export function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Filtros
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  const logTypes = [
    { value: "all", label: "📋 Todos os Tipos" },
    { value: "sale", label: "💰 Vendas" },
    { value: "stock", label: "📦 Estoque" },
    { value: "discount", label: "🏷️ Descontos" },
    { value: "user", label: "👤 Usuários" },
    { value: "auth", label: "🔐 Autenticação" },
    { value: "system", label: "⚙️ Sistema" },
  ];

  const logLevels = [
    { value: "all", label: "Todos os Níveis" },
    { value: "info", label: "ℹ️ Informação" },
    { value: "warning", label: "⚠️ Aviso" },
    { value: "error", label: "❌ Erro" },
    { value: "critical", label: "🚨 Crítico" },
  ];

  // Carregar usuários
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await apiFetch("/users");
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar usuários:", err);
      }
    };
    loadUsers();
  }, []);

  // Carregar logs
  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          start: dateRange.start,
          end: dateRange.end,
        });

        if (filterType !== "all") params.append("type", filterType);
        if (filterLevel !== "all") params.append("level", filterLevel);

        const data = await apiFetch(`/logs?${params}`);
        setLogs(Array.isArray(data) ? data : []);
      } catch (loadError) {
        console.error("Erro ao carregar logs:", loadError);
        setError(loadError.message || "Falha ao carregar logs.");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, [filterType, filterLevel, dateRange]);

  // Filtrar logs localmente (texto, usuário)
  const filteredLogs = useCallback(() => {
    return logs.filter(log => {
      // Filtro por usuário
      if (filterUser !== "all" && log.performed_by !== parseInt(filterUser)) {
        return false;
      }
      
      // Filtro por texto (busca em ação e detalhes)
      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        const actionDesc = getActionDescription(log.action).toLowerCase();
        const details = (log.details || "").toLowerCase();
        const userName = (log.user_name || "").toLowerCase();
        
        return (
          actionDesc.includes(searchLower) ||
          details.includes(searchLower) ||
          userName.includes(searchLower)
        );
      }
      
      return true;
    });
  }, [logs, filterUser, searchText]);

  // Exportar logs
  const handleExportLogs = () => {
    const logsToExport = filteredLogs();
    if (logsToExport.length === 0) {
      alert("Sem logs para exportar.");
      return;
    }

    const headers = ["Data/Hora", "Tipo", "Nível", "Usuário", "Ação", "Descrição", "Detalhes"];
    const csv = [
      headers.join(","),
      ...logsToExport.map((log) =>
        [
          log.created_at ? new Date(log.created_at).toLocaleString("pt-BR") : "",
          log.type || "",
          log.level || "",
          log.user_name || "",
          log.action || "",
          getActionDescription(log.action),
          `"${formatDetails(log.details, log.action).replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `logs_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.click();
  };

  const getLevelColor = (level) => {
    switch (level) {
      case "info":
        return "#2196f3";
      case "warning":
        return "#ff9800";
      case "error":
        return "#f44336";
      case "critical":
        return "#9c27b0";
      default:
        return "#999";
    }
  };

  const getLevelLabel = (level) => {
    const map = {
      info: "Informação",
      warning: "Aviso",
      error: "Erro",
      critical: "Crítico",
    };
    return map[level] || level;
  };

  const displayedLogs = filteredLogs();
  const stats = {
    total: displayedLogs.length,
    info: displayedLogs.filter(l => l.level === "info").length,
    warning: displayedLogs.filter(l => l.level === "warning").length,
    error: displayedLogs.filter(l => l.level === "error").length,
    critical: displayedLogs.filter(l => l.level === "critical").length,
  };

  return (
    <PageShell
      title="Logs de Auditoria"
      subtitle="Histórico de todas as ações realizadas no sistema"
      actions={
        <button className="button" onClick={handleExportLogs}>
          📥 Exportar CSV
        </button>
      }
    >
      <div className="logs-container">
        {/* Cartões de Resumo */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total de Eventos</div>
          </div>
          <div className="stat-card info">
            <div className="stat-value">{stats.info}</div>
            <div className="stat-label">Informações</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{stats.warning}</div>
            <div className="stat-label">Avisos</div>
          </div>
          <div className="stat-card error">
            <div className="stat-value">{stats.error}</div>
            <div className="stat-label">Erros</div>
          </div>
          <div className="stat-card critical">
            <div className="stat-value">{stats.critical}</div>
            <div className="stat-label">Críticos</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters-panel">
          <div className="filter-group">
            <label>📅 Data Inicial:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>📅 Data Final:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>📋 Tipo:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              {logTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>⚡ Nível:</label>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="filter-select"
            >
              {logLevels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>👤 Usuário:</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="filter-select"
            >
              <option value="all">Todos os Usuários</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>🔍 Buscar:</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar em ações, detalhes..."
              className="filter-input search-input"
            />
          </div>
        </div>

        {/* Mensagens */}
        {error && <div className="error-message">{error}</div>}

        {/* Tabela de Logs */}
        {loading ? (
          <p className="loading">⏳ Carregando logs...</p>
        ) : displayedLogs.length > 0 ? (
          <div className="logs-wrapper">
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Ação</th>
                    <th>Nível</th>
                    <th>Usuário</th>
                    <th>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.map((log, idx) => (
                    <tr key={idx} className={`level-${log.level}`}>
                      <td className="date-cell">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString("pt-BR")
                          : "-"}
                      </td>
                      <td className="action-cell">
                        <span className="action-icon">
                          {getActionIcon(log.action)}
                        </span>
                        <span className="action-text">
                          {getActionDescription(log.action)}
                        </span>
                      </td>
                      <td className="level-cell">
                        <span
                          className="level-badge"
                          style={{ backgroundColor: getLevelColor(log.level) }}
                        >
                          {getLevelLabel(log.level)}
                        </span>
                      </td>
                      <td className="user-cell">{log.user_name || "Sistema"}</td>
                      <td className="details-cell">
                        {formatDetails(log.details, log.action)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="logs-summary">
              <p>
                Mostrando <strong>{displayedLogs.length}</strong> de{" "}
                <strong>{logs.length}</strong> registros
              </p>
            </div>
          </div>
        ) : (
          <p className="no-data">
            🔍 Nenhum log encontrado para os filtros selecionados.
          </p>
        )}
      </div>
    </PageShell>
  );
}
