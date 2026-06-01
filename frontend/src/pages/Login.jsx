import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Leaf, Mail, Lock, LogIn, AlertCircle, Sun, Moon } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();

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
      <button 
        type="button" 
        className="login-theme-toggle" 
        onClick={toggleTheme}
        title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-container">
            <Leaf className="login-logo-icon" size={48} />
          </div>
          <h1>GreenStore Pro</h1>
          <p>Gestão Inteligente de Hortifruti</p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <div className="input-with-icon">
              <Mail className="input-icon" size={18} />
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
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <div className="input-with-icon">
              <Lock className="input-icon" size={18} />
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="loading-spinner"></span>
            ) : (
              <>
                <LogIn size={18} />
                <span>Acessar Sistema</span>
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>© 2026 GreenStore Pro</p>
        </div>
      </div>
    </div>
  );
}
