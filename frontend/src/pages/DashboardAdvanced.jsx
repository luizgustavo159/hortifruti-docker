import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { PageShell } from '../components/PageShell';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';
import './DashboardAdvanced.css';

export function DashboardAdvanced() {
  const [salesData, setSalesData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [operatorData, setOperatorData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Simular dados de vendas por hora
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hora: `${i}:00`,
        vendas: Math.floor(Math.random() * 5000) + 1000,
        lucro: Math.floor(Math.random() * 2000) + 500,
      }));
      setSalesData(hourlyData);

      // Simular dados por categoria
      const categories = [
        { name: 'Frutas', value: 35, color: '#ef4444' },
        { name: 'Legumes', value: 28, color: '#10b981' },
        { name: 'Verduras', value: 22, color: '#3b82f6' },
        { name: 'Tubérculos', value: 15, color: '#f59e0b' },
      ];
      setCategoryData(categories);

      // Simular dados por operador
      const operators = [
        { nome: 'João Silva', vendas: 12500, meta: 15000 },
        { nome: 'Maria Santos', vendas: 14200, meta: 15000 },
        { nome: 'Pedro Costa', vendas: 11800, meta: 15000 },
        { nome: 'Ana Oliveira', vendas: 13900, meta: 15000 },
      ];
      setOperatorData(operators);

      // Simular heatmap de horários
      const heatmap = Array.from({ length: 24 }, (_, i) => ({
        hora: i,
        intensidade: Math.floor(Math.random() * 100),
      }));
      setHeatmapData(heatmap);
    } catch (error) {
      toast.error('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageShell title="Dashboard Avançado"><div className="loading">Carregando...</div></PageShell>;
  }

  return (
    <PageShell
      title="Dashboard Avançado"
      subtitle="Análise profissional de vendas em tempo real"
    >
      <div className="dashboard-advanced">
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
              <Tooltip />
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

        {/* Gráfico de Lucro vs Meta */}
        <div className="chart-container">
          <h3>💰 Desempenho por Operador</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={operatorData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="vendas" fill="#10b981" name="Vendas" />
              <Bar dataKey="meta" fill="#3b82f6" name="Meta" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Pizza - Categorias */}
        <div className="chart-container">
          <h3>🥧 Vendas por Categoria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name} (${value}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap de Horários */}
        <div className="chart-container">
          <h3>🔥 Mapa de Calor - Horários de Pico</h3>
          <div className="heatmap">
            {heatmapData.map((item, idx) => (
              <div
                key={idx}
                className="heatmap-cell"
                style={{
                  backgroundColor: `rgba(16, 185, 129, ${item.intensidade / 100})`,
                }}
                title={`${item.hora}:00 - Intensidade: ${item.intensidade}%`}
              >
                <span className="heatmap-label">{item.hora}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insights */}
        <div className="insights-section">
          <h3>💡 Insights Automáticos</h3>
          <div className="insights-grid">
            <div className="insight-card">
              <h4>Horário de Pico</h4>
              <p className="insight-value">12:00 - 14:00</p>
              <p className="insight-desc">Maior movimento de vendas</p>
            </div>
            <div className="insight-card">
              <h4>Categoria Top</h4>
              <p className="insight-value">Frutas</p>
              <p className="insight-desc">35% do faturamento</p>
            </div>
            <div className="insight-card">
              <h4>Operador Destaque</h4>
              <p className="insight-value">Maria Santos</p>
              <p className="insight-desc">94.7% da meta</p>
            </div>
            <div className="insight-card">
              <h4>Produto Crítico</h4>
              <p className="insight-value">Alface</p>
              <p className="insight-desc">Estoque baixo - Reabastecer!</p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
