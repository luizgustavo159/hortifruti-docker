import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminDashboard.css";

export function AdminDashboard() {
  const [summary, setSummary] = useState({
    total_sales: 0,
    total_losses: 0,
    low_stock: [],
  });
  const [reports, setReports] = useState({
    by_operator: [],
    by_category: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  // Carregar dados ao montar e quando mudar o intervalo de datas
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          start: dateRange.start,
          end: dateRange.end,
        });

        const [summaryData, operatorData, categoryData] = await Promise.all([
          apiFetch(`/reports/summary?${params}`),
          apiFetch(`/reports/by-operator?${params}`),
          apiFetch(`/reports/by-category?${params}`),
        ]);

        setSummary(summaryData || {});
        setReports({
          by_operator: operatorData || [],
          by_category: categoryData || [],
        });
      } catch (loadError) {
        setError(loadError.message || "Falha ao carregar relatórios.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [dateRange]);

  const totalSales = Number(summary.total_sales || 0);
  const totalLosses = Number(summary.total_losses || 0);
  const estimatedProfit = Number(summary.estimated_profit || 0);
  const lowStockCount = summary.low_stock?.length || 0;
  
  // Lucro líquido aproximado (Vendas - Custo das Vendas - Perdas)
  const netProfit = estimatedProfit - totalLosses;
  const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  return (
    <PageShell
      title="Dashboard Administrativo"
      subtitle="Visão geral de vendas, operadores e desempenho"
    >
      <div className="dashboard-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <button 
            className="button" 
            onClick={() => window.location.href = '/admin/advanced'}
            style={{ backgroundColor: '#3b82f6' }}
          >
            Ver Dashboard Avançado (Gráficos)
          </button>
        </div>
        {/* Filtro de Data */}
        <div className="date-filter">
          <div className="date-group">
            <label>Data Inicial:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
            />
          </div>
          <div className="date-group">
            <label>Data Final:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
            />
          </div>
        </div>

        {/* Mensagens */}
        {error && <div className="error-message">{error}</div>}

        {/* Cards de Resumo */}
        <div className="card-grid">
          <div className="card">
            <h3>Total de Vendas</h3>
            <strong className="value-large">
              R$ {totalSales.toFixed(2)}
            </strong>
            <p className="card-subtitle">Faturamento bruto</p>
          </div>
          <div className="card">
            <h3>Lucro Estimado</h3>
            <strong className="value-large" style={{ color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
              R$ {netProfit.toFixed(2)}
            </strong>
            <p className="card-subtitle">Já descontado o custo (CMV)</p>
          </div>
          <div className="card">
            <h3>Margem Líquida</h3>
            <strong className="value-large">{margin.toFixed(1)}%</strong>
            <p className="card-subtitle">Lucro real sobre vendas</p>
          </div>
          <div className="card">
            <h3>Itens Críticos</h3>
            <strong className="value-large warning">{lowStockCount}</strong>
            <p className="card-subtitle">Produtos em baixo estoque</p>
          </div>
        </div>

        {/* Conteúdo Principal */}
        {loading ? (
          <p className="loading">Carregando dados...</p>
        ) : (
          <div className="dashboard-grid">
            {/* Relatório por Operador */}
            <div className="card">
              <h3>Desempenho por Operador</h3>
              {reports.by_operator && reports.by_operator.length > 0 ? (
                <div className="report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Operador</th>
                        <th>Vendas</th>
                        <th>Quantidade</th>
                        <th>Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.by_operator.map((op, idx) => {
                        const avgTicket =
                          op.total_items > 0 ? op.total_sales / op.total_items : 0;
                        return (
                          <tr key={idx}>
                            <td>{op.name || "Desconhecido"}</td>
                            <td>R$ {Number(op.total_sales).toFixed(2)}</td>
                            <td>{op.total_items}</td>
                            <td>R$ {avgTicket.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="no-data">Sem dados para o período.</p>
              )}
            </div>

            {/* Relatório por Categoria */}
            <div className="card">
              <h3>Vendas por Categoria</h3>
              {reports.by_category && reports.by_category.length > 0 ? (
                <div className="report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th>Itens Vendidos</th>
                        <th>Total de Vendas</th>
                        <th>% do Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.by_category.map((cat, idx) => {
                        const percentage =
                          totalSales > 0
                            ? ((Number(cat.total_sales) / totalSales) * 100).toFixed(1)
                            : 0;
                        return (
                          <tr key={idx}>
                            <td>{cat.category || "Sem categoria"}</td>
                            <td>{cat.total_items}</td>
                            <td>R$ {Number(cat.total_sales).toFixed(2)}</td>
                            <td>
                              <div className="percentage-bar">
                                <div
                                  className="bar"
                                  style={{ width: `${percentage}%` }}
                                />
                                <span>{percentage}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="no-data">Sem dados para o período.</p>
              )}
            </div>

            {/* Produtos em Baixo Estoque */}
            <div className="card full-width">
              <h3>Produtos em Baixo Estoque</h3>
              {lowStockCount > 0 ? (
                <div className="low-stock-list">
                  {summary.low_stock.map((item) => (
                    <div key={item.id} className="low-stock-item">
                      <div className="item-info">
                        <h4>{item.name}</h4>
                        <p className="item-details">
                          Estoque: {item.current_stock} | Mínimo:{" "}
                          {item.min_stock}
                        </p>
                      </div>
                      <div className="item-status">
                        <span className="badge critical">
                          {Math.round(
                            (item.current_stock / item.min_stock) * 100
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data">Todos os produtos estão em nível adequado.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
