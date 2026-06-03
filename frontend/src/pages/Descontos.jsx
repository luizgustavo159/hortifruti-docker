import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Descontos.css";

const DISCOUNT_TYPES = [
  { value: "percent", label: "Percentual (%)" },
  { value: "fixed", label: "Valor Fixo (R$)" },
  { value: "buy_x_get_y", label: "Compre X Leve Y" },
  { value: "fixed_bundle", label: "Combo (Qtd. por Preço Fixo)" },
];

const TARGET_TYPES = [
  { value: "all", label: "Todos os Produtos" },
  { value: "category", label: "Categoria Específica" },
  { value: "product", label: "Produtos Específicos" },
];

const defaultForm = {
  name: "",
  type: "percent",
  value: "",
  description: "",
  target_type: "all",
  target_value: "",
  selected_ids: [],
  min_quantity: "",
  buy_quantity: "",
  get_quantity: "",
  starts_at: "",
  ends_at: "",
  starts_time: "",
  ends_time: "",
  days_of_week: [],
  stacking_rule: "exclusive",
  priority: 0,
  active: true,
};

export function Descontos() {
  const [discounts, setDiscounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState(defaultForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [discountsData, productsData, categoriesData] = await Promise.all([
        apiFetch("/discounts"),
        apiFetch("/products"),
        apiFetch("/categories")
      ]);
      setDiscounts(Array.isArray(discountsData) ? discountsData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (err) {
      setError("Erro ao carregar dados: " + (err.message || "Falha na requisição."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNewModal = () => {
    setEditingDiscount(null);
    setFormData(defaultForm);
    setError("");
    setShowModal(true);
  };

  const openEditModal = (discount) => {
    setEditingDiscount(discount);
    let selectedIds = [];
    if (discount.target_type === "product") {
      try {
        selectedIds = JSON.parse(discount.target_value || "[]");
      } catch {
        selectedIds = [];
      }
    }

    setFormData({
      name: discount.name || "",
      type: discount.type || "percent",
      value: discount.value || "",
      description: discount.description || "",
      target_type: discount.target_type || "all",
      target_value: discount.target_type === "category" ? discount.target_value : "",
      selected_ids: selectedIds,
      min_quantity: discount.min_quantity || "",
      buy_quantity: discount.buy_quantity || "",
      get_quantity: discount.get_quantity || "",
      starts_at: discount.starts_at ? discount.starts_at.split("T")[0] : "",
      ends_at: discount.ends_at ? discount.ends_at.split("T")[0] : "",
      starts_time: discount.starts_time || "",
      ends_time: discount.ends_time || "",
      days_of_week: Array.isArray(discount.days_of_week) ? discount.days_of_week : [],
      stacking_rule: discount.stacking_rule || "exclusive",
      priority: discount.priority || 0,
      active: discount.active === 1 || discount.active === true,
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmitDiscount = async (e) => {
    e.preventDefault();
    setError("");

    setLoading(true);
    try {
      const payload = {
        ...formData,
        value: parseFloat(formData.value) || 0,
        target_value: formData.target_type === "product"
          ? JSON.stringify(formData.selected_ids)
          : formData.target_value || null,
        active: formData.active ? 1 : 0,
      };

      const method = editingDiscount ? "PUT" : "POST";
      const url = editingDiscount ? `/discounts/${editingDiscount.id}` : "/discounts";

      await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccessMessage(editingDiscount ? "Desconto atualizado!" : "Desconto criado!");
      setShowModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao salvar desconto.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDiscount = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este desconto?")) return;
    try {
      await apiFetch(`/discounts/${id}`, { method: "DELETE" });
      setSuccessMessage("Desconto excluído.");
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao excluir desconto.");
    }
  };

  return (
    <PageShell
      title="Gestão de Descontos"
      subtitle="Crie e gerencie campanhas de desconto"
      actions={<button className="button" onClick={openNewModal}>+ Novo Desconto</button>}
    >
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="card-grid">
        <div className="card"><h3>Ativos</h3><strong className="value-large">{discounts.filter(d => d.active).length}</strong></div>
        <div className="card"><h3>Total</h3><strong className="value-large">{discounts.length}</strong></div>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Alvo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="loading">Carregando...</td></tr>
            ) : discounts.length === 0 ? (
              <tr><td colSpan="5" className="no-data">Nenhum desconto cadastrado.</td></tr>
            ) : (
              discounts.map(d => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td>{DISCOUNT_TYPES.find(t => t.value === d.type)?.label || d.type}</td>
                  <td>{TARGET_TYPES.find(t => t.value === d.target_type)?.label || d.target_type}</td>
                  <td>
                    <span className={`status ${d.active ? 'ok' : 'critical'}`}>
                      {d.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-action" onClick={() => openEditModal(d)}>Editar</button>
                      <button className="btn-action" style={{ background: 'var(--accent-danger)' }} onClick={() => handleDeleteDiscount(d.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingDiscount ? "Editar Desconto" : "Novo Desconto"}</h2>
            <form onSubmit={handleSubmitDiscount}>
              <div className="form-group">
                <label>Nome do Desconto</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                    {DISCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Valor</label>
                  <input 
                    type="number" 
                    value={formData.value} 
                    onChange={e => setFormData({...formData, value: e.target.value})} 
                    required 
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={loading}>Salvar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
