import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Descontos.css";

export function Descontos() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "percent",
    value: 0,
    description: "",
    buy_quantity: "",
    get_quantity: "",
    min_quantity: ""
  });

  // Carregar descontos
  useEffect(() => {
    loadDiscounts();
  }, []);

  const loadDiscounts = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/discounts");
      setDiscounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao carregar descontos:", err);
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  };

  // Criar novo desconto
  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!formData.name) {
      setError("O nome do desconto é obrigatório.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        value: formData.value ? parseFloat(formData.value) : 0,
        buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity) : null,
        get_quantity: formData.get_quantity ? parseInt(formData.get_quantity) : null,
        min_quantity: formData.min_quantity ? parseInt(formData.min_quantity) : null
      };

      await apiFetch("/discounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccessMessage("Desconto criado com sucesso!");
      setFormData({ 
        name: "", type: "percent", value: 0, description: "", 
        buy_quantity: "", get_quantity: "", min_quantity: "" 
      });
      setShowModal(false);
      loadDiscounts();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao criar desconto.");
    } finally {
      setLoading(false);
    }
  };

  // Deletar desconto
  const handleDeleteDiscount = async (id) => {
    if (window.confirm("Tem certeza que deseja deletar este desconto?")) {
      try {
        await apiFetch(`/discounts/${id}`, { method: "DELETE" });
        setSuccessMessage("Desconto deletado com sucesso!");
        loadDiscounts();
        setTimeout(() => setSuccessMessage(""), 3000);
      } catch (err) {
        setError(err.message || "Erro ao deletar desconto.");
      }
    }
  };

  const getTypeName = (type) => {
    const types = {
      percent: 'Porcentagem',
      fixed: 'Valor Fixo',
      buy_x_get_y: 'Leve X Pague Y',
      fixed_bundle: 'Combo Fixo'
    };
    return types[type] || type;
  };

  const activeDiscounts = discounts.filter((d) => d.active !== false).length;
  const totalDiscounts = discounts.length;

  return (
    <PageShell
      title="Gestão de Descontos"
      subtitle="Crie e gerencie campanhas de desconto para aumentar vendas"
      actions={
        <button
          className="button"
          onClick={() => setShowModal(true)}
          style={{ marginBottom: "0" }}
        >
          + Novo Desconto
        </button>
      }
    >
      {/* Mensagens */}
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Cards de Resumo */}
      <div className="card-grid">
        <div className="card">
          <h3>Descontos Ativos</h3>
          <strong>{activeDiscounts}</strong>
          <p>Campanhas em execução</p>
        </div>
        <div className="card">
          <h3>Total de Descontos</h3>
          <strong>{totalDiscounts}</strong>
          <p>Cadastrados no sistema</p>
        </div>
        <div className="card">
          <h3>Desconto Máximo</h3>
          <strong>50%</strong>
          <p>Limite configurável</p>
        </div>
        <div className="card">
          <h3>Impacto Médio</h3>
          <strong>+15%</strong>
          <p>Aumento de giro</p>
        </div>
      </div>

      {/* Modal de Criar Desconto */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Criar Novo Desconto</h2>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDiscount} className="form-grid">
              <div className="form-group full-width">
                <label>Nome do Desconto *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Quarta Verde"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tipo de Desconto *</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                  <option value="buy_x_get_y">Leve X Pague Y</option>
                  <option value="fixed_bundle">Combo Fixo (Ex: 3 por R$ 10)</option>
                </select>
              </div>

              {(formData.type === 'percent' || formData.type === 'fixed' || formData.type === 'fixed_bundle') && (
                <div className="form-group">
                  <label>{formData.type === 'fixed_bundle' ? 'Preço do Combo (R$)' : 'Valor *'}</label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        value: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="Ex: 15"
                    min="0"
                    step="0.1"
                    required
                  />
                </div>
              )}

              {(formData.type === 'buy_x_get_y' || formData.type === 'fixed_bundle') && (
                <div className="form-group">
                  <label>Quantidade Necessária *</label>
                  <input
                    type="number"
                    value={formData.buy_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, buy_quantity: e.target.value })
                    }
                    placeholder="Ex: 3"
                    required
                  />
                </div>
              )}

              {formData.type === 'buy_x_get_y' && (
                <div className="form-group">
                  <label>Quantidade Grátis *</label>
                  <input
                    type="number"
                    value={formData.get_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, get_quantity: e.target.value })
                    }
                    placeholder="Ex: 1"
                    required
                  />
                </div>
              )}

              <div className="form-group full-width">
                <label>Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Detalhes da campanha..."
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button" disabled={loading}>
                  {loading ? "Criando..." : "Criar Desconto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Descontos */}
      <div className="discounts-section">
        <h2>Descontos Cadastrados</h2>

        {loading && <p style={{ textAlign: "center", color: "#999" }}>Carregando...</p>}

        {!loading && discounts.length === 0 && (
          <div className="empty-state">
            <p>Nenhum desconto cadastrado ainda.</p>
            <button className="button" onClick={() => setShowModal(true)}>
              Criar Primeiro Desconto
            </button>
          </div>
        )}

        {!loading && discounts.length > 0 && (
          <div className="discounts-grid">
            {discounts.map((discount) => (
              <div key={discount.id} className="discount-card">
                <div className="discount-header">
                  <h3>{discount.name}</h3>
                  <span className="discount-type">{getTypeName(discount.type)}</span>
                </div>

                <div className="discount-value">
                  {discount.type === "percent" && (
                    <span className="value">{discount.value}%</span>
                  )}
                  {discount.type === "fixed" && (
                    <span className="value">R$ {parseFloat(discount.value).toFixed(2)}</span>
                  )}
                  {discount.type === "buy_x_get_y" && (
                    <span className="value">Leve {discount.buy_quantity} Pague {discount.buy_quantity - (discount.get_quantity || 0)}</span>
                  )}
                  {discount.type === "fixed_bundle" && (
                    <span className="value">{discount.buy_quantity} por R$ {parseFloat(discount.value).toFixed(2)}</span>
                  )}
                </div>

                {discount.description && (
                  <p className="discount-description">{discount.description}</p>
                )}

                <div className="discount-footer">
                  <button
                    className="btn-delete"
                    onClick={() => handleDeleteDiscount(discount.id)}
                  >
                    Deletar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
