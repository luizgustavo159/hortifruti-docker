import { useState, useEffect } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminLogs.css";

export function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  const logTypes = [
    { value: "all", label: "Todos os Tipos" },
    { value: "sale", label: "Vendas" },
    { value: "stock", label: "Estoque" },
    { value: "user", label: "Usuários" },
    { value: "auth", label: "Autenticação" },
    { value: "system", label: "Sistema" },
  ];

  const logLevels = [
    { value: "all", label: "Todos os Níveis" },
    { value: "info", label: "Informação" },
    { value: "warning", label: "Aviso" },
    { value: "error", label: "Erro" },
    { value: "critical", label: "Crítico" },
  ];

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

        const data = await apiFetch(`/api/logs?${params}`);
        setLogs(data || []);
      } catch (loadError) {
        setError(loadError.message || "Falha ao carregar logs.");
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, [filterType, filterLevel, dateRange]);

  // Exportar logs
  const handleExportLogs = () => {
    if (logs.length === 0) {
      alert("Sem logs para exportar.");
      return;
    }

    const headers = ["Data/Hora", "Tipo", "Nível", "Usuário", "Ação", "Detalhes"];
    const csv = [
      headers.join(","),
      ...logs.map((log) =>
        [
          log.created_at || "",
          log.type || "",
          log.level || "",
          log.user_name || "",
          log.action || "",
          `"${(log.details || "").replace(/"/g, '""')}"`,
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

  return (
    <PageShell
      title="Logs de Auditoria"
      subtitle="Histórico de todas as ações realizadas no sistema"
      actions={
        <button className="button" onClick={handleExportLogs}>
          Exportar CSV
        </button>
      }
    >
      <div className="logs-container">
        {/* Filtros */}
        <div className="filters-panel">
          <div className="filter-group">
            <label>Data Inicial:</label>
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
            <label>Data Final:</label>
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
            <label>Tipo:</label>
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
            <label>Nível:</label>
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
        </div>

        {/* Mensagens */}
        {error && <div className="error-message">{error}</div>}

        {/* Tabela de Logs */}
        {loading ? (
          <p className="loading">Carregando logs...</p>
        ) : logs.length > 0 ? (
          <div className="logs-wrapper">
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Tipo</th>
                    <th>Nível</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={idx}>
                      <td className="date-cell">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="type-cell">{log.type || "-"}</td>
                      <td className="level-cell">
                        <span
                          className="level-badge"
                          style={{ backgroundColor: getLevelColor(log.level) }}
                        >
                          {getLevelLabel(log.level)}
                        </span>
                      </td>
                      <td className="user-cell">{log.user_name || "-"}</td>
                      <td className="action-cell">{log.action || "-"}</td>
                      <td className="details-cell">{log.details || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="logs-summary">
              <p>
                Total de registros: <strong>{logs.length}</strong>
              </p>
            </div>
          </div>
        ) : (
          <p className="no-data">Nenhum log encontrado para os filtros selecionados.</p>
        )}
      </div>
    </PageShell>
  );
}
