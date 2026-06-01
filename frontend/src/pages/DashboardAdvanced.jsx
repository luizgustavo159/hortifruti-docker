import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { PageShell } from '../components/PageShell';
import { apiFetch } from '../lib/api';
import './DashboardAdvanced.css';

export function DashboardAdvanced() {
  const [salesData, setSalesData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [operatorData, setOperatorData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });

      const [summary, byOperator, byCategory, hourlySales] = await Promise.all([
        apiFetch(`/reports/summary?${params}`),
        apiFetch(`/reports/by-operator?${params}`),
        apiFetch(`/reports/by-category?${params}`),
        apiFetch(`/reports/hourly-sales?${params}`),
      ]);

      setSummaryData(summary);

      // Processar dados por operador
      if (Array.isArray(byOperator)) {
        setOperatorData(byOperator.slice(0, 5).map(op => ({
          nome: op.name || "Sem nome",
          vendas: Number(op.total_sales || 0),
          itens: Number(op.total_items || 0),
        })));
      }

      // Processar dados por categoria
      if (Array.isArray(byCategory)) {
        // Cores mais vibrantes para modo escuro/claro
        const colors = ['#f87171', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6'];
        setCategoryData(byCategory.map((cat, idx) => ({
          name: cat.category || "Sem categoria",
          value: Number(cat.total_sales || 0),
          items: Number(cat.total_items || 0),
          color: colors[idx % colors.length],
        })));
      }

      // Dados reais de vendas por hora vindos do backend
      if (Array.isArray(hourlySales)) {
        setSalesData(hourlySales);
      }
    } catch (err) {
      setError(err.message || "Erro ao carregar dados do dashboard");
      console.error("Erro ao carregar dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Dashboard Avançado">
        <div className="loading">Carregando dados...</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Dashboard Avançado"
      subtitle="Análise profissional de vendas em tempo real"
    >
      <div className="dashboard-advanced">
        {error && <div className="error-message">{error}</div>}

        {/* Filtro de Data */}
        <div className="date-filter">
          <div className="filter-group">
            <label>Data Inicial:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Data Final:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
        </div>

        {/* Cards de Resumo */}
        {summaryData && (
          <div className="card-grid">
            <div className="card">
              <h3>Total de Vendas</h3>
              <strong className="value-large">R$ {Number(summaryData.total_sales || 0).toFixed(2)}</strong>
              <p className="card-subtitle">No período selecionado</p>
            </div>
            <div className="card">
              <h3>Lucro Estimado</h3>
              <strong className="value-large" style={{ color: (Number(summaryData.estimated_profit || 0) - Number(summaryData.total_losses || 0)) >= 0 ? '#10b981' : '#ef4444' }}>
                R$ {(Number(summaryData.estimated_profit || 0) - Number(summaryData.total_losses || 0)).toFixed(2)}
              </strong>
              <p className="card-subtitle">Descontando CMV e Perdas</p>
            </div>
            <div className="card">
              <h3>Itens Críticos</h3>
              <strong className={`value-large ${summaryData.low_stock?.length > 0 ? 'critical' : ''}`}>{summaryData.low_stock?.length || 0}</strong>
              <p className="card-subtitle">Abaixo do estoque mínimo</p>
            </div>
          </div>
        )}

        {/* Gráfico de Vendas por Hora */}
        <div className="chart-container">
          <h3>📈 Vendas por Hora</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={salesData}>
              <defs>
                <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hora" />
              <YAxis />
              <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
              <Area
                type="monotone"
                dataKey="vendas"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorVendas)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Vendas por Operador */}
        <div className="chart-container">
          <h3>💰 Desempenho por Operador</h3>
          {operatorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={operatorData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
                <Legend />
                <Bar dataKey="vendas" fill="#10b981" name="Vendas (R$)" />
                <Bar dataKey="itens" fill="#3b82f6" name="Itens Vendidos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Nenhum dado de operador disponível</p>
          )}
        </div>

        {/* Gráfico de Pizza - Categorias */}
        <div className="chart-container">
          <h3>🥧 Vendas por Categoria</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (R$ ${value.toFixed(0)})`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="no-data">Nenhum dado de categoria disponível</p>
          )}
        </div>

        {/* Insights */}
        <div className="insights-section">
          <h3>💡 Insights Automáticos</h3>
          <div className="insights-grid">
            {operatorData.length > 0 && (
              <div className="insight-card">
                <h4>Operador Destaque</h4>
                <p className="insight-value">{operatorData[0]?.nome || "N/A"}</p>
                <p className="insight-desc">R$ {operatorData[0]?.vendas.toFixed(2) || "0.00"} em vendas</p>
              </div>
            )}
            {categoryData.length > 0 && (
              <div className="insight-card">
                <h4>Categoria Top</h4>
                <p className="insight-value">{categoryData[0]?.name || "N/A"}</p>
                <p className="insight-desc">R$ {categoryData[0]?.value.toFixed(2) || "0.00"}</p>
              </div>
            )}
            {summaryData?.low_stock && summaryData.low_stock.length > 0 && (
              <div className="insight-card">
                <h4>Produto Crítico</h4>
                <p className="insight-value">{summaryData.low_stock[0]?.name || "N/A"}</p>
                <p className="insight-desc">Estoque: {summaryData.low_stock[0]?.current_stock || 0}</p>
              </div>
            )}
            {summaryData && (
              <div className="insight-card">
                <h4>Total de Vendas</h4>
                <p className="insight-value">R$ {Number(summaryData.total_sales || 0).toFixed(2)}</p>
                <p className="insight-desc">No período selecionado</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
