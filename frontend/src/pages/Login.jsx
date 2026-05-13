import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/caixa");
    } catch (submitError) {
      setError(submitError.message || "Falha ao autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <h1>GreenStore Pro</h1>
        <p>Centralize vendas, estoque e performance em um painel moderno e seguro.</p>
        <div className="panel-grid">
          <div className="panel">
            <h4>Visão 360°</h4>
            <p>Indicadores diários, alertas e prioridades organizadas.</p>
          </div>
          <div className="panel">
            <h4>Operação ágil</h4>
            <p>Fluxo de caixa rápido com histórico de decisões.</p>
          </div>
        </div>
      </section>
      <section className="login-card">
        <form className="form" onSubmit={onSubmit}>
          <h2>Entrar</h2>
          <label>
            Email
            <input
              type="email"
              placeholder="nome@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Acessar painel"}
          </button>
          <span className="badge">Suporte 24/7</span>
        </form>
      </section>
    </div>
  );
}
