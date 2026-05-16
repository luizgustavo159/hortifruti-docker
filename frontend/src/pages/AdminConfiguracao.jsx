import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminConfiguracao.css";

export function AdminConfiguracao() {
  // Mapeamento de chaves: UI -> Backend
  // discount_max_percent -> max_discount
  // low_stock_alert -> alert_threshold (ou similar)
  // session_timeout -> lock_minutes (usado para bloqueio, mas aqui como timeout)
  
  const [settings, setSettings] = useState({
    store_name: "GreenStore",
    store_cnpj: "00.000.000/0000-00",
    store_address: "Rua Principal, 123",
    store_phone: "(00) 0000-0000",
    store_email: "contato@greenstore.com",
    currency: "BRL",
    tax_rate: 0,
    max_discount: 50, // Corrigido para chave do backend
    max_losses: 10,   // Nova chave do backend
    max_stock_adjust: 100, // Nova chave do backend
    login_attempts: 5, // Nova chave do backend
    lock_minutes: 10,  // Nova chave do backend
    backup_enabled: true,
    backup_frequency: "daily",
    session_timeout: 30,
    language: "pt-BR",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Carregar configurações
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const data = await apiFetch("/settings");
        if (data) {
          // Converter valores vindos como string do backend para tipos corretos
          const typedData = {};
          Object.keys(data).forEach(key => {
            const val = data[key];
            if (val === "true") typedData[key] = true;
            else if (val === "false") typedData[key] = false;
            else if (!isNaN(val) && val !== "") typedData[key] = parseFloat(val);
            else typedData[key] = val;
          });
          setSettings(prev => ({ ...prev, ...typedData }));
        }
      } catch (err) {
        console.error("Erro ao carregar configurações:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Salvar configurações
  const handleSaveSettings = async () => {
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });

      setSuccessMessage("Configurações salvas com sucesso!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (saveError) {
      setError(saveError.message || "Erro ao salvar configurações.");
    } finally {
      setLoading(false);
    }
  };

  // Resetar para padrão
  const handleResetToDefault = () => {
    if (window.confirm("Tem certeza que deseja resetar todas as configurações para o padrão?")) {
      const defaults = {
        store_name: "GreenStore",
        store_cnpj: "00.000.000/0000-00",
        store_address: "Rua Principal, 123",
        store_phone: "(00) 0000-0000",
        store_email: "contato@greenstore.com",
        currency: "BRL",
        tax_rate: 0,
        max_discount: 50,
        max_losses: 10,
        max_stock_adjust: 100,
        login_attempts: 5,
        lock_minutes: 10,
        backup_enabled: true,
        backup_frequency: "daily",
        session_timeout: 30,
        language: "pt-BR",
      };
      setSettings(defaults);
      setSuccessMessage("Configurações resetadas para o padrão!");
      setTimeout(() => setSuccessMessage(""), 3000);
    }
  };

  return (
    <PageShell
      title="Configurações do Sistema"
      subtitle="Personalize os parâmetros e preferências do GreenStore"
      actions={
        <div className="action-buttons">
          <button className="button" onClick={handleSaveSettings} disabled={loading}>
            {loading ? "Salvando..." : "Salvar Configurações"}
          </button>
          <button className="button-secondary" onClick={handleResetToDefault}>
            Resetar Padrão
          </button>
        </div>
      }
    >
      <div className="settings-container">
        {/* Mensagens */}
        {error && <div className="error-message">{error}</div>}
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {/* Seção: Informações da Loja */}
        <div className="settings-section">
          <h2>Informações da Loja</h2>
          <div className="settings-grid">
            <div className="form-group">
              <label>Nome da Loja</label>
              <input
                type="text"
                value={settings.store_name}
                onChange={(e) =>
                  setSettings({ ...settings, store_name: e.target.value })
                }
                placeholder="Digite o nome da loja"
              />
            </div>

            <div className="form-group">
              <label>CNPJ</label>
              <input
                type="text"
                value={settings.store_cnpj}
                onChange={(e) =>
                  setSettings({ ...settings, store_cnpj: e.target.value })
                }
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="form-group">
              <label>Endereço</label>
              <input
                type="text"
                value={settings.store_address}
                onChange={(e) =>
                  setSettings({ ...settings, store_address: e.target.value })
                }
                placeholder="Rua, número, complemento"
              />
            </div>

            <div className="form-group">
              <label>Telefone</label>
              <input
                type="tel"
                value={settings.store_phone}
                onChange={(e) =>
                  setSettings({ ...settings, store_phone: e.target.value })
                }
                placeholder="(00) 0000-0000"
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={settings.store_email}
                onChange={(e) =>
                  setSettings({ ...settings, store_email: e.target.value })
                }
                placeholder="contato@loja.com"
              />
            </div>
          </div>
        </div>

        {/* Seção: Configurações Financeiras e Regras */}
        <div className="settings-section">
          <h2>Regras de Negócio e Financeiro</h2>
          <div className="settings-grid">
            <div className="form-group">
              <label>Moeda</label>
              <select
                value={settings.currency}
                onChange={(e) =>
                  setSettings({ ...settings, currency: e.target.value })
                }
              >
                <option value="BRL">Real (R$)</option>
                <option value="USD">Dólar (US$)</option>
                <option value="EUR">Euro (€)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Desconto Máximo (%)</label>
              <input
                type="number"
                value={settings.max_discount}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_discount: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="50"
                min="0"
                max="100"
              />
              <small>Limite para descontos sem aprovação</small>
            </div>

            <div className="form-group">
              <label>Limite de Perda S/ Aprovação</label>
              <input
                type="number"
                value={settings.max_losses}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_losses: parseInt(e.target.value) || 0,
                  })
                }
              />
              <small>Qtd máxima de perda manual</small>
            </div>

            <div className="form-group">
              <label>Limite Ajuste Estoque S/ Aprovação</label>
              <input
                type="number"
                value={settings.max_stock_adjust}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_stock_adjust: parseInt(e.target.value) || 0,
                  })
                }
              />
              <small>Delta máximo de ajuste manual</small>
            </div>
          </div>
        </div>

        {/* Seção: Segurança e Acesso */}
        <div className="settings-section">
          <h2>Segurança e Acesso</h2>
          <div className="settings-grid">
            <div className="form-group">
              <label>Tentativas de Login</label>
              <input
                type="number"
                value={settings.login_attempts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    login_attempts: parseInt(e.target.value) || 5,
                  })
                }
              />
              <small>Tentativas antes do bloqueio</small>
            </div>

            <div className="form-group">
              <label>Tempo de Bloqueio (minutos)</label>
              <input
                type="number"
                value={settings.lock_minutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    lock_minutes: parseInt(e.target.value) || 10,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Tempo de Sessão (minutos)</label>
              <input
                type="number"
                value={settings.session_timeout}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    session_timeout: parseInt(e.target.value) || 30,
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Seção: Backup e Preferências */}
        <div className="settings-section">
          <h2>Backup e Preferências</h2>
          <div className="settings-grid">
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.backup_enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      backup_enabled: e.target.checked,
                    })
                  }
                />
                Ativar Backup Automático
              </label>
            </div>

            <div className="form-group">
              <label>Idioma</label>
              <select
                value={settings.language}
                onChange={(e) =>
                  setSettings({ ...settings, language: e.target.value })
                }
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en-US">English (USA)</option>
                <option value="es-ES">Español (España)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Seção: Informações do Sistema */}
        <div className="settings-section info-section">
          <h2>Informações do Sistema</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Versão:</span>
              <span className="info-value">1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">Status:</span>
              <span className="info-value status-ok">Operacional</span>
            </div>
            <div className="info-item">
              <span className="info-label">Banco de Dados:</span>
              <span className="info-value">SQLite (Emulação) / PostgreSQL</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
