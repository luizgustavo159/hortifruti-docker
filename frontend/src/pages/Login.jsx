import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
    } catch (submitError) {
      setError(submitError.message || "Falha ao autenticar. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="hero-content">
          <div className="logo-container">
            <div className="logo-icon">🌿</div>
            <h1>GreenStore Pro</h1>
          </div>
          <p className="hero-description">
            A solução definitiva para gestão de hortifruti. 
            Controle seu estoque, vendas e finanças em um só lugar.
          </p>
          
          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <div>
                <h4>Dashboard Inteligente</h4>
                <p>Visualize sua performance em tempo real com gráficos detalhados.</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📦</span>
              <div>
                <h4>Controle de Estoque</h4>
                <p>Gestão automatizada de entradas, saídas e alertas de reposição.</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">💰</span>
              <div>
                <h4>Fluxo de Caixa</h4>
                <p>Acompanhamento rigoroso de todas as movimentações financeiras.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-footer">
          <p>© 2026 GreenStore Pro. Todos os direitos reservados.</p>
        </div>
      </section>

      <section className="login-card-container">
        <div className="login-form-wrapper">
          <form className="login-form" onSubmit={onSubmit}>
            <div className="form-header">
              <h2>Bem-vindo de volta</h2>
              <p>Acesse sua conta para gerenciar sua loja</p>
            </div>

            <div className="form-group">
              <label htmlFor="email">E-mail corporativo</label>
              <div className="input-wrapper">
                <span className="input-icon">✉️</span>
                <input
                  id="email"
                  type="email"
                  placeholder="exemplo@greenstore.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Senha de acesso</label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  id="password"
                  type="password"
                  placeholder="Sua senha segura"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="form-error">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? (
                <span className="loading-spinner"></span>
              ) : (
                "Entrar no Sistema"
              )}
            </button>

            <div className="form-footer">
              <p>Esqueceu sua senha? <a href="#">Contate o administrador</a></p>
            </div>
          </form>
          
          <div className="support-badge">
            <span className="pulse"></span>
            Suporte Técnico Ativo
          </div>
        </div>
      </section>
    </div>
  );
}
