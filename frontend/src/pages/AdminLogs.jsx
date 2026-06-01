import { useState, useEffect, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminLogs.css";

// Mapeamento de ações técnicas para descrições amigáveis
const ACTION_DESCRIPTIONS = {
  // Ações em Português (Novas)
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
  "tentativa_venda_caixa_fechado": "Venda Bloqueada (Caixa Fechado)",
  "erro_sistema": "Erro Crítico no Servidor",
  "erro_cliente": "Aviso de Uso do Sistema",
  "excecao_nao_tratada": "Falha Grave Inesperada",
  "erro_migracao": "Erro de Estrutura do Banco",
  "erro_seed": "Erro de Dados Iniciais",
  "erro_fatal_inicializacao": "Erro Fatal ao Iniciar",
  "solicitacao_recuperacao_senha": "Pedido de Nova Senha",
  "recuperacao_senha_concluida": "Senha Alterada com Sucesso",
  "item_removido": "Item Removido do Carrinho",
  "desconto_manual_autorizado": "Desconto Manual Autorizado",
  "fluxo_caixa_registrado": "Movimentação Financeira",
  "conta_financeira_criada": "Conta Financeira Criada",
  "conta_financeira_liquidada": "Conta Financeira Liquidada",

  // Mapeamento de Legado (Inglês para Português)
  "sale_created": "Venda Realizada",
  "sale_cancelled": "Venda Cancelada",
  "sale_refunded": "Reembolso Processado",
  "stock_adjusted": "Estoque Ajustado",
  "stock_adjust": "Ajuste de Estoque",
  "stock_received": "Estoque Recebido",
  "stock_loss": "Perda de Estoque",
  "stock_move": "Movimentação de Estoque",
  "product_created": "Produto Cadastrado",
  "product_updated": "Produto Atualizado",
  "product_deleted": "Produto Removido",
  "category_created": "Categoria Criada",
  "supplier_created": "Fornecedor Cadastrado",
  "purchase_order_created": "Pedido de Compra Criado",
  "purchase_order_approved": "Pedido de Compra Aprovado",
  "purchase_order_received": "Pedido de Compra Recebido",
  "user_created": "Usuário Criado",
  "user_updated": "Usuário Atualizado",
  "user_deleted": "Usuário Deletado",
  "password_reset": "Senha Redefinida",
  "login_success": "Login Bem-sucedido",
  "login_failed": "Falha de Login",
  "discount_created": "Desconto Criado",
  "discount_updated": "Desconto Atualizado",
  "discount_deleted": "Desconto Deletado",
  "approval_requested": "Aprovação Solicitada",
  "approval_granted": "Aprovação Concedida",
  "approval_denied": "Aprovação Negada",
  "settings_changed": "Configurações Alteradas",
  "admin_bootstrap": "Sistema Inicializado",
  "cash_session_opened": "Abertura de Caixa",
  "cash_session_closed": "Fechamento de Caixa",
  "sale_attempt_failed_cash_closed": "Venda Bloqueada (Caixa Fechado)",
  "client_error": "Aviso de Uso do Sistema",
  "system_error": "Erro Crítico no Servidor",
  "migration_error": "Erro de Estrutura do Banco",
  "unhandled_exception": "Falha Grave Inesperada"
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
    
    // TRADUÇÃO AGRESSIVA PARA HUMANO (Sem termos técnicos)
    if (action === "erro_cliente" || action === "client_error") {
      const status = parsed.status || parsed.codigo_status || "400";
      const path = parsed.path || parsed.caminho_acessado || "uma página";
      return `O sistema recusou um acesso em ${path} (Código: ${status}). Isso geralmente ocorre por falta de permissão ou dados inválidos.`;
    }

    if (action === "erro_sistema" || action === "system_error") {
      return `O servidor encontrou uma falha interna ao processar uma solicitação. O suporte técnico foi notificado automaticamente.`;
    }

    if (action === "erro_migracao" || action === "migration_error") {
      return `Falha crítica ao atualizar a estrutura do banco de dados. Verifique os arquivos de sistema.`;
    }

    if (action === "tentativa_venda_caixa_fechado" || action === "sale_attempt_failed_cash_closed") {
      return `Venda bloqueada: Um operador tentou vender com o caixa fechado. O caixa deve ser aberto primeiro.`;
    }

    // Mapeamento de chaves técnicas para nomes amigáveis em português
    const KEY_MAP = {
      "id_venda": "Venda #",
      "numero_documento": "Documento",
      "valor_total": "Subtotal",
      "valor_final": "Total",
      "valor_final_com_desconto": "Total Final",
      "forma_pagamento": "Pagamento",
      "quantidade_itens": "Qtd Itens",
      "mensagem": "Informação",
      "id_produto": "Cód. Produto",
      "nome_produto": "Produto",
      "quantidade_perda": "Qtd Perda",
      "motivo_perda": "Motivo",
      "estoque_anterior": "Estoque Ant.",
      "estoque_atual": "Estoque Novo",
      "variacao_estoque": "Ajuste",
      "motivo_ajuste": "Motivo",
      "id_usuario": "Cód. Usuário",
      "email_usuario": "E-mail",
      "perfil_usuario": "Perfil",
      "id_sessao": "Cód. Caixa",
      "valor_abertura": "Abertura",
      "valor_fechamento": "Fechamento",
      "valor_esperado": "Esperado",
      "diferenca_valor": "Diferença",
      "tipo_movimentacao": "Tipo",
      "valor": "Valor",
      "motivo": "Motivo",
      "id_aprovacao": "Cód. Aprovação",
      "acao_aprovada": "Ação Autorizada",
      "acao_autorizada": "Ação Autorizada",
      "metodo_http": "Método",
      "caminho_acessado": "Página",
      "codigo_status": "Status",
      "tempo_resposta_ms": "Tempo (ms)",
      "id_requisicao": "ID Req.",
      "mensagem_erro": "Erro",
      "detalhe": "Detalhe",
      "erro_tecnico": "Erro Técnico",
      "orientacao": "Orientação",
      // Legado
      "sale_id": "Venda #",
      "document_number": "Documento",
      "total": "Subtotal",
      "final_total": "Total",
      "payment_method": "Pagamento",
      "items_count": "Qtd Itens",
      "product_id": "Cód. Produto",
      "product_name": "Produto",
      "quantity": "Quantidade",
      "reason": "Motivo",
      "prev_stock": "Estoque Ant.",
      "next_stock": "Estoque Novo",
      "user_id": "Cód. Usuário",
      "email": "E-mail",
      "role": "Perfil",
      "session_id": "Cód. Caixa",
      "opening_amount": "Abertura",
      "closing_amount": "Fechamento",
      "expected_amount": "Esperado",
      "difference_amount": "Diferença",
      "type": "Tipo",
      "amount": "Valor",
      "notes": "Observações",
      "status": "Status",
      "method": "Método",
      "path": "Página",
      "duration_ms": "Tempo (ms)",
      "request_id": "ID Req.",
      "error_message": "Erro"
    };

    // Se houver uma mensagem principal, usá-la como destaque
    const mainMessage = parsed.mensagem || parsed.detalhe || parsed.descricao_amigavel;
    
    // Filtrar chaves para não repetir a mensagem principal e chaves técnicas irrelevantes
    const detailEntries = Object.entries(parsed).filter(([k]) => 
      k !== "mensagem" && k !== "detalhe" && k !== "descricao_amigavel" && k !== "pilha_erro" && k !== "request_id" && k !== "id_requisicao"
    );

    if (detailEntries.length === 0) return mainMessage || "Sem detalhes";

    const detailsString = detailEntries.map(([k, v]) => {
      const label = KEY_MAP[k] || k.replace(/_/g, ' ').toUpperCase();
      let val = typeof v === "object" ? JSON.stringify(v) : String(v);
      
      // Traduzir valores comuns
      if (val === "cash") val = "Dinheiro";
      if (val === "credit_card") val = "Cartão de Crédito";
      if (val === "debit_card") val = "Cartão de Débito";
      if (val === "pix") val = "PIX";
      if (val === "in") val = "Entrada";
      if (val === "out") val = "Saída";
      
      return `${label}: ${val}`;
    }).join(" | ");

    return mainMessage ? `${mainMessage} (${detailsString})` : detailsString;
  } catch {
    return details;
  }
};

export function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  
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
                    <th style={{ textAlign: 'center' }}>Ações</th>
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
                        <div className="details-preview">
                          {formatDetails(log.details, log.action)}
                        </div>
                      </td>
                      <td className="actions-cell">
                        <button 
                          className="view-details-btn"
                          onClick={() => setSelectedLog(log)}
                          title="Ver detalhes completos"
                        >
                          👁️ Abrir
                        </button>
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
        {/* Modal de Detalhes do Log */}
        {selectedLog && (
          <div className="log-modal-overlay" onClick={() => setSelectedLog(null)}>
            <div className="log-modal-content" onClick={e => e.stopPropagation()}>
              <div className="log-modal-header">
                <h3>🔍 Detalhes do Log</h3>
                <button className="close-modal-btn" onClick={() => setSelectedLog(null)}>×</button>
              </div>
              <div className="log-modal-body">
                <div className="log-info-grid">
                  <div className="info-item">
                    <label>📅 Data/Hora:</label>
                    <span>{new Date(selectedLog.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="info-item">
                    <label>⚡ Ação:</label>
                    <span>{getActionDescription(selectedLog.action)}</span>
                  </div>
                  <div className="info-item">
                    <label>📊 Nível:</label>
                    <span className="level-badge" style={{ backgroundColor: getLevelColor(selectedLog.level) }}>
                      {getLevelLabel(selectedLog.level)}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>👤 Usuário:</label>
                    <span>{selectedLog.user_name || "Sistema"}</span>
                  </div>
                </div>
                
                <div className="log-details-full">
                  <label>📝 Descrição Completa:</label>
                  <div className="details-box">
                    {formatDetails(selectedLog.details, selectedLog.action)}
                  </div>
                </div>

                {selectedLog.details && (
                  <div className="log-raw-data">
                    <label>💻 Dados Brutos (JSON):</label>
                    <pre>
                      {JSON.stringify(typeof selectedLog.details === 'string' ? JSON.parse(selectedLog.details) : selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <div className="log-modal-footer">
                <button className="button" onClick={() => setSelectedLog(null)}>Fechar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
