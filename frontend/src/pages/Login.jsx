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
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🌿</div>
          <h1>GreenStore Pro</h1>
          <p>Gestão Inteligente de Hortifruti</p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "Autenticando..." : "Acessar Sistema"}
          </button>
        </form>

        <div className="login-footer">
          <p>© 2026 GreenStore Pro</p>
        </div>
      </div>
    </div>
  );
}
