import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Leaf, Mail, Lock, LogIn, AlertCircle, Sun, Moon } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let timer;
    if (remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [remainingTime]);
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const onSubmit = async (event) => {
    event.preventDefault();
    if (remainingTime > 0) return;

    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (submitError) {
      const attempts = submitError.data?.attempts;
      const isBlocked = submitError.data?.blocked;
      const waitTime = submitError.data?.remainingSeconds;

      if (waitTime) {
        setRemainingTime(waitTime);
        setError(`Muitas tentativas. Aguarde ${waitTime}s.`);
        return;
      }

      if (isBlocked) {
        alert("🚫 USUÁRIO BLOQUEADO\n\nEste usuário foi bloqueado por excesso de tentativas falhas ou por decisão administrativa.\n\nPor favor, procure o administrador do sistema para redefinir sua senha.");
        setError("Usuário bloqueado por segurança.");
      } else if (attempts === 5) {
        alert("⚠️ AVISO DE SEGURANÇA\n\nVocê já errou a senha 5 vezes.\n\nMais 5 tentativas incorretas e seu usuário será BLOQUEADO automaticamente.");
        setError("5 tentativas falhas. Atenção ao limite de 10.");
      } else if (attempts === 9) {
        alert("🚨 ÚLTIMA TENTATIVA!\n\nVocê errou a senha 9 vezes.\n\nSe errar agora, sua conta será BLOQUEADA por segurança e apenas um administrador poderá reativá-la.");
        setError("ÚLTIMA TENTATIVA antes do bloqueio!");
      } else {
        setError(submitError.message || "Falha ao autenticar. Verifique suas credenciais.");
      }
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
            <label htmlFor="email">E-mail ou Usuário</label>
            <div className="input-with-icon">
              <Mail className="input-icon" size={18} />
              <input
                id="email"
                type="text"
                placeholder="ex: luiz ou luiz@email.com"
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

          <button 
            className={`login-submit ${remainingTime > 0 ? 'bg-gray-400 cursor-not-allowed' : ''}`} 
            type="submit" 
            disabled={loading || remainingTime > 0}
          >
            {loading ? (
              <span className="loading-spinner"></span>
            ) : remainingTime > 0 ? (
              <span>Tente em {remainingTime}s</span>
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
