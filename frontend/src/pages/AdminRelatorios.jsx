import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { getAuthUser } from "../lib/auth";
import { ApprovalModal } from "../components/ApprovalModal";
import "./AdminRelatorios.css";

export function AdminRelatorios() {
  const user = getAuthUser();
  const [reportType, setReportType] = useState("sales");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showApproval, setShowApproval] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });
  const [filterOperator, setFilterOperator] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [operators, setOperators] = useState([]);
  const [categories, setCategories] = useState([]);

  // Carregar operadores e categorias
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [operatorsData, categoriesData] = await Promise.all([
          apiFetch("/users"),
          apiFetch("/categories"),
        ]);
        setOperators(Array.isArray(operatorsData) ? operatorsData.filter(u => u.role === 'operator') : []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      } catch (err) {
        console.error("Erro ao carregar filtros:", err);
      }
    };
    loadFilters();
  }, []);

  // Carregar dados do relatório
  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });

      if (filterOperator) params.append("operator_id", filterOperator);
      if (filterCategory) params.append("category_id", filterCategory);

      let endpoint = "";
      if (reportType === "sales") {
        endpoint = `/sales/recent?start=${dateRange.start}&end=${dateRange.end}`;
      } else {
        endpoint = `/reports/${reportType}?start=${dateRange.start}&end=${dateRange.end}`;
      }

      const reportData = await apiFetch(endpoint);
      if (reportType === "performance") {
        setData(reportData);
      } else {
        setData(Array.isArray(reportData) ? reportData : []);
      }
    } catch (loadError) {
      setError(loadError.message || "Falha ao carregar relatório.");
    } finally {
      setLoading(false);
    }
  }, [reportType, dateRange, filterOperator, filterCategory]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Exportar para CSV
  const handleExportCSV = () => {
    if (data.length === 0) {
      alert("Sem dados para exportar.");
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (typeof value === "string" && value.includes(",")) {
              return `"${value}"`;
            }
            return value;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${reportType}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Calcular totais
  const calculateTotals = () => {
    const totals = {};
    if (!Array.isArray(data)) return totals;
    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (typeof row[key] === "number") {
          totals[key] = (totals[key] || 0) + row[key];
        }
      });
    });
    return totals;
  };

  const totals = calculateTotals();

  const handleDeleteSale = (id) => {
    setPendingDeleteId(id);
    setShowApproval(true);
  };

  const confirmDeleteSale = async (token) => {
    try {
      await apiFetch(`/sales/${pendingDeleteId}`, { 
        method: 'DELETE',
        headers: { 'X-Approval-Token': token }
      });
      setShowApproval(false);
      setPendingDeleteId(null);
      loadReport();
    } catch (err) {
      alert("Erro ao excluir venda: " + err.message);
    }
  };

  return (
    <PageShell
      title="Relatórios Financeiros"
      subtitle="Análise detalhada de vendas, caixa e contas"
      actions={
        <button className="button" onClick={handleExportCSV}>
          Exportar CSV
        </button>
      }
    >
      <div className="reports-container">
        {/* Filtros */}
        <div className="filters-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
          <div className="filter-group">
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Tipo:</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="input"
            >
              <option value="sales">Vendas</option>
              <option value="summary">Resumo Geral</option>
              <option value="by-operator">Por Operador</option>
              <option value="by-category">Por Categoria</option>
              <option value="performance">Performance de Vendas</option>
            </select>
          </div>

          <div className="filter-group">
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Data Inicial:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="input"
            />
          </div>

          <div className="filter-group">
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Data Final:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="input"
            />
          </div>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

        {showApproval && (
          <ApprovalModal
            title="Autorização para Excluir Venda"
            message="Esta operação irá estornar o estoque e excluir o registro permanentemente. Requer senha de gerente."
            action="delete_sale"
            onApproved={confirmDeleteSale}
            onCancel={() => setShowApproval(false)}
          />
        )}

        {loading ? (
          <p className="loading">Carregando relatório...</p>
        ) : reportType === "performance" && data ? (
          <div className="performance-dashboard">
            <div className="performance-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="performance-card" style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px' }}>
                <h3>📈 Top 10 Produtos por Lucro</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Volume</th>
                      <th>Receita</th>
                      <th>Lucro Bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts?.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td>{p.volume}</td>
                        <td>R$ {p.revenue.toFixed(2)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>R$ {p.profit.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="performance-card" style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px' }}>
                <h3>🕒 Vendas por Hora</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Vendas</th>
                      <th>Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.hourly?.map((h, i) => (
                      <tr key={i}>
                        <td>{h.hour}:00</td>
                        <td>{h.total_sales}</td>
                        <td>R$ {h.total_revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : data.length > 0 ? (
          <div className="report-wrapper">
<div className="table-responsive">
	              <table className="report-table">
                <thead>
                  <tr>
                    {Object.keys(data[0]).map((header) => (
                      <th key={header}>{formatHeader(header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      {Object.keys(row).map((key) => (
                        <td key={key}>{formatValue(row[key])}</td>
                      ))}
                      {reportType === "sales" && (
                        <td>
                          {['supervisor', 'manager', 'admin'].includes(user?.role) && (
                            <button 
                              className="button-danger"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => handleDeleteSale(row.id)}
                            >
                              Excluir
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="no-data">Nenhum dado disponível para o período selecionado.</p>
        )}
      </div>
    </PageShell>
  );
}

function formatHeader(header) {
  const translations = {
    "id": "ID",
    "product_id": "Cód. Produto",
    "quantity": "Quantidade",
    "total": "Total (R$)",
    "discount_id": "Cód. Desconto",
    "discount_amount": "Vl. Desconto",
    "final_total": "Total Final",
    "payment_method": "Pagamento",
    "sold_by": "Vendedor",
    "created_at": "Data/Hora",
    "cancelled_at": "Cancelado em",
    "cancel_reason": "Motivo Cancel.",
    "cancelled_by": "Cancelado por",
    "document_number": "Documento",
    "fiscal_status": "Status Fiscal",
    "amount_received": "Recebido",
    "change_amount": "Troco",
    "customer_id": "Cód. Cliente",
    "product_name": "Produto",
    "customer_name": "Cliente",
    "category_name": "Categoria",
    "operator_name": "Operador",
    "sale_count": "Qtd. Vendas",
    "total_revenue": "Receita Total",
    "avg_ticket": "Ticket Médio",
    "actions": "Ações"
  };

  return translations[header] || header
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(value) {
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value;
}
