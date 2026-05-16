import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Descontos.css";

export function Descontos() {
  const [discounts, setDiscounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    type: "percent",
    value: 0,
    description: "",
    target_type: "all", // all, product, category
    target_value: "", // ID do produto ou categoria
    selected_ids: [] // Para múltiplos produtos
  });

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
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    setError("");
    
    if (!formData.name) {
      setError("O nome do desconto é obrigatório.");
      return;
    }

    if (formData.target_type === "product" && formData.selected_ids.length === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }

    setLoading(true);
    try {
      // Se for múltiplos produtos, o backend pode precisar tratar target_value como JSON string de IDs
      const payload = {
        ...formData,
        target_value: formData.target_type === "product" 
          ? JSON.stringify(formData.selected_ids) 
          : formData.target_value,
        value: parseFloat(formData.value) || 0
      };

      await apiFetch("/discounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccessMessage("Desconto criado com sucesso!");
      setFormData({ name: "", type: "percent", value: 0, description: "", target_type: "all", target_value: "", selected_ids: [] });
      setShowModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao criar desconto.");
    } finally {
      setLoading(false);
    }
  };

  const toggleProductId = (id) => {
    setFormData(prev => ({
      ...prev,
      selected_ids: prev.selected_ids.includes(id)
        ? prev.selected_ids.filter(i => i !== id)
        : [...prev.selected_ids, id]
    }));
  };

  return (
    <PageShell
      title="Gestão de Descontos"
      subtitle="Crie campanhas para produtos específicos ou categorias"
      actions={<button className="button" onClick={() => setShowModal(true)}>+ Novo Desconto</button>}
    >
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="card-grid">
        <div className="card"><h3>Ativos</h3><strong>{discounts.length}</strong></div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <h2>Novo Desconto</h2>
            <form onSubmit={handleCreateDiscount} className="form-grid">
              <div className="form-group full-width">
                <label>Nome *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>

              <div className="form-group">
                <label>Tipo</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Fixo (R$)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Valor</label>
                <input type="number" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} required />
              </div>

              <div className="form-group full-width">
                <label>Aplicar a:</label>
                <select value={formData.target_type} onChange={e => setFormData({...formData, target_type: e.target.value, selected_ids: [], target_value: ""})}>
                  <option value="all">Todos os Produtos</option>
                  <option value="category">Uma Categoria</option>
                  <option value="product">Produtos Específicos</option>
                </select>
              </div>

              {formData.target_type === "category" && (
                <div className="form-group full-width">
                  <label>Selecione a Categoria</label>
                  <select value={formData.target_value} onChange={e => setFormData({...formData, target_value: e.target.value})} required>
                    <option value="">Selecione...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {formData.target_type === "product" && (
                <div className="form-group full-width">
                  <label>Selecione os Produtos (Checkboxes)</label>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px', borderRadius: '8px', background: '#f9f9f9' }}>
                    {products.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <input type="checkbox" checked={formData.selected_ids.includes(p.id)} onChange={() => toggleProductId(p.id)} />
                        <span style={{ fontSize: '14px' }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="submit" className="button">Criar Desconto</button>
                <button type="button" className="button-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="discounts-grid">
        {discounts.map(d => (
          <div key={d.id} className="discount-card">
            <h3>{d.name}</h3>
            <p>{d.type === 'percent' ? `${d.value}%` : `R$ ${d.value}`}</p>
            <p><small>Alvo: {d.target_type === 'all' ? 'Todos' : d.target_type === 'category' ? 'Categoria' : 'Produtos'}</small></p>
            <button className="btn-delete" onClick={async () => { if(window.confirm('Excluir?')) { await apiFetch(`/discounts/${d.id}`, {method: 'DELETE'}); loadData(); } }}>Excluir</button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
