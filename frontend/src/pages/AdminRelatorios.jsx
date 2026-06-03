import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminRelatorios.css";

export function AdminRelatorios() {
  const [reportType, setReportType] = useState("sales");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
        endpoint = "/sales/recent"; // Fallback para rota existente
      } else {
        endpoint = `/reports/${reportType}`;
      }

      const reportData = await apiFetch(endpoint);
      setData(Array.isArray(reportData) ? reportData : []);
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

        {loading ? (
          <p className="loading">Carregando relatório...</p>
        ) : data.length > 0 ? (
          <div className="report-wrapper">
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="table">
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
  return header
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
