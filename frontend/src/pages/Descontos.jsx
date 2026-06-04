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

const DAYS_OF_WEEK = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
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

    let days = [];
    if (discount.days_of_week) {
      try {
        days = typeof discount.days_of_week === 'string' ? JSON.parse(discount.days_of_week) : discount.days_of_week;
      } catch {
        days = [];
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
      days_of_week: days,
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

    if (!formData.name) {
      setError("O nome do desconto é obrigatório.");
      return;
    }
    if (formData.type === "percent" && (formData.value === "" || Number(formData.value) <= 0)) {
      setError("Informe o percentual de desconto.");
      return;
    }
    if (formData.type === "fixed" && (formData.value === "" || Number(formData.value) <= 0)) {
      setError("Informe o valor fixo do desconto.");
      return;
    }
    if (formData.type === "buy_x_get_y" && (!formData.buy_quantity || !formData.get_quantity)) {
      setError("Informe a quantidade de compra e a quantidade grátis.");
      return;
    }
    if (formData.type === "fixed_bundle" && (!formData.buy_quantity || !formData.value)) {
      setError("Informe a quantidade do combo e o preço fixo.");
      return;
    }
    if (formData.target_type === "product" && formData.selected_ids.length === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }
    if (formData.target_type === "category" && !formData.target_value) {
      setError("Selecione uma categoria.");
      return;
    }
    if (formData.starts_at && formData.ends_at && formData.starts_at > formData.ends_at) {
      setError("A data de início deve ser anterior à data de fim.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        value: parseFloat(formData.value) || 0,
        description: formData.description || "",
        target_type: formData.target_type,
        target_value: formData.target_type === "product"
          ? JSON.stringify(formData.selected_ids)
          : formData.target_value || null,
        min_quantity: formData.min_quantity ? parseInt(formData.min_quantity) : null,
        buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity) : null,
        get_quantity: formData.get_quantity ? parseInt(formData.get_quantity) : null,
        starts_at: formData.starts_at || null,
        ends_at: formData.ends_at || null,
        starts_time: formData.starts_time || null,
        ends_time: formData.ends_time || null,
        days_of_week: formData.days_of_week.length > 0 ? JSON.stringify(formData.days_of_week) : null,
        stacking_rule: formData.stacking_rule || "exclusive",
        priority: parseInt(formData.priority) || 0,
        active: formData.active ? 1 : 0,
      };

      const method = editingDiscount ? "PUT" : "POST";
      const url = editingDiscount ? `/discounts/${editingDiscount.id}` : "/discounts";

      await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccessMessage(editingDiscount ? "Desconto atualizado!" : "Desconto criado!");
      setFormData(defaultForm);
      setShowModal(false);
      setEditingDiscount(null);
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
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao excluir desconto.");
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

  const toggleDayOfWeek = (day) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day]
    }));
  };

  const formatDiscountValue = (d) => {
    if (d.type === "percent") return `${d.value}% de desconto`;
    if (d.type === "fixed") return `R$ ${Number(d.value).toFixed(2)} de desconto`;
    if (d.type === "buy_x_get_y") return `Compre ${d.buy_quantity} Leve ${Number(d.buy_quantity) + Number(d.get_quantity)}`;
    if (d.type === "fixed_bundle") return `${d.buy_quantity} unidades por R$ ${Number(d.value).toFixed(2)}`;
    return d.type;
  };

  const formatTarget = (d) => {
    if (d.target_type === "all") return "Todos os produtos";
    if (d.target_type === "category") {
      const cat = categories.find(c => String(c.id) === String(d.target_value));
      return `Categoria: ${cat ? cat.name : d.target_value}`;
    }
    if (d.target_type === "product") {
      try {
        const ids = JSON.parse(d.target_value || "[]");
        const names = ids.map(id => {
          const p = products.find(pr => pr.id === id);
          return p ? p.name : `#${id}`;
        });
        return `Produtos: ${names.join(", ")}`;
      } catch {
        return "Produtos específicos";
      }
    }
    return d.target_type;
  };

  const activeDiscounts = discounts.filter(d => d.active === 1 || d.active === true);
  const inactiveDiscounts = discounts.filter(d => d.active === 0 || d.active === false);

  return (
    <PageShell
      title="Gestão de Descontos"
      subtitle="Crie e gerencie campanhas de desconto para produtos e categorias"
      actions={<button className="button" onClick={openNewModal}>+ Novo Desconto</button>}
    >
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="card-grid">
        <div className="card"><h3>Descontos Ativos</h3><strong style={{ color: '#16a34a' }}>{activeDiscounts.length}</strong></div>
        <div className="card"><h3>Descontos Inativos</h3><strong style={{ color: '#6b7280' }}>{inactiveDiscounts.length}</strong></div>
        <div className="card"><h3>Total de Descontos</h3><strong>{discounts.length}</strong></div>
      </div>

      {/* Modal: Novo Desconto */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingDiscount ? "Editar Desconto" : "Novo Desconto"}</h2>
            <form onSubmit={handleSubmitDiscount} className="form-grid">

              {/* Informações Básicas */}
              <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', marginBottom: '16px' }}>
                <h4 style={{ color: '#374151', marginBottom: '12px' }}>Informações Básicas</h4>
                <div className="form-group full-width">
                  <label>Nome do Desconto *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Promoção de Verão, Desconto Fidelidade..."
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de Desconto *</label>
                    <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value, value: "", buy_quantity: "", get_quantity: ""})}>
                      {DISCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {(formData.type === "percent" || formData.type === "fixed") && (
                    <div className="form-group">
                      <label>{formData.type === "percent" ? "Percentual (%) *" : "Valor Fixo (R$) *"}</label>
                      <input
                        type="number"
                        step={formData.type === "percent" ? "1" : "0.01"}
                        min="0"
                        max={formData.type === "percent" ? "100" : undefined}
                        value={formData.value}
                        onChange={e => setFormData({...formData, value: e.target.value})}
                        placeholder={formData.type === "percent" ? "Ex: 10" : "Ex: 5.00"}
                        required
                      />
                    </div>
                  )}
                </div>

                {formData.type === "buy_x_get_y" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Compre (Qtd.) *</label>
                      <input type="number" min="1" value={formData.buy_quantity} onChange={e => setFormData({...formData, buy_quantity: e.target.value})} placeholder="Ex: 3" required />
                    </div>
                    <div className="form-group">
                      <label>Leve Grátis (Qtd.) *</label>
                      <input type="number" min="1" value={formData.get_quantity} onChange={e => setFormData({...formData, get_quantity: e.target.value})} placeholder="Ex: 1" required />
                    </div>
                  </div>
                )}

                {formData.type === "fixed_bundle" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Quantidade do Combo *</label>
                      <input type="number" min="1" value={formData.buy_quantity} onChange={e => setFormData({...formData, buy_quantity: e.target.value})} placeholder="Ex: 5" required />
                    </div>
                    <div className="form-group">
                      <label>Preço Fixo do Combo (R$) *</label>
                      <input type="number" step="0.01" min="0" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} placeholder="Ex: 20.00" required />
                    </div>
                  </div>
                )}

                <div className="form-group full-width">
                  <label>Quantidade Mínima para Ativar</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_quantity}
                    onChange={e => setFormData({...formData, min_quantity: e.target.value})}
                    placeholder="0 = sem mínimo"
                  />
                  <small style={{ color: '#6b7280' }}>Desconto só se aplica a partir desta quantidade</small>
                </div>

                <div className="form-group full-width">
                  <label>Descrição</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Descrição opcional do desconto..."
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={e => setFormData({...formData, active: e.target.checked})}
                    />
                    Desconto Ativo
                  </label>
                </div>
              </div>

              {/* Alvo */}
              <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', marginBottom: '16px' }}>
                <h4 style={{ color: '#374151', marginBottom: '12px' }}>Aplicar a</h4>
                <div className="form-group full-width">
                  <label>Alvo do Desconto</label>
                  <select
                    value={formData.target_type}
                    onChange={e => setFormData({...formData, target_type: e.target.value, selected_ids: [], target_value: ""})}
                  >
                    {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {formData.target_type === "category" && (
                  <div className="form-group full-width">
                    <label>Categoria *</label>
                    <select
                      value={formData.target_value}
                      onChange={e => setFormData({...formData, target_value: e.target.value})}
                      required
                    >
                      <option value="">Selecione uma categoria...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {formData.target_type === "product" && (
                  <div className="form-group full-width">
                    <label>Produtos * ({formData.selected_ids.length} selecionado(s))</label>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #d1d5db', padding: '10px', borderRadius: '8px', background: '#f9fafb' }}>
                      {products.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '14px' }}>Nenhum produto disponível.</p>
                      ) : products.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <input
                            type="checkbox"
                            id={`prod-${p.id}`}
                            checked={formData.selected_ids.includes(p.id)}
                            onChange={() => toggleProductId(p.id)}
                          />
                          <label htmlFor={`prod-${p.id}`} style={{ fontSize: '14px', cursor: 'pointer' }}>
                            {p.name} <span style={{ color: '#6b7280' }}>— R$ {Number(p.price).toFixed(2)}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Vigência */}
              <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', marginBottom: '16px' }}>
                <h4 style={{ color: '#374151', marginBottom: '12px' }}>Vigência (Opcional)</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Data de Início</label>
                    <input type="date" value={formData.starts_at} onChange={e => setFormData({...formData, starts_at: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Data de Fim</label>
                    <input type="date" value={formData.ends_at} onChange={e => setFormData({...formData, ends_at: e.target.value})} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Hora de Início</label>
                    <input type="time" value={formData.starts_time} onChange={e => setFormData({...formData, starts_time: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Hora de Fim</label>
                    <input type="time" value={formData.ends_time} onChange={e => setFormData({...formData, ends_time: e.target.value})} />
                  </div>
                </div>
                <div className="form-group full-width">
                  <label>Dias da Semana (deixe em branco para todos os dias)</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {DAYS_OF_WEEK.map(d => (
                      <label key={d.value} style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                        background: formData.days_of_week.includes(d.value) ? '#2563eb' : '#f3f4f6',
                        color: formData.days_of_week.includes(d.value) ? '#fff' : '#374151',
                        fontSize: '13px', fontWeight: '500'
                      }}>
                        <input
                          type="checkbox"
                          style={{ display: 'none' }}
                          checked={formData.days_of_week.includes(d.value)}
                          onChange={() => toggleDayOfWeek(d.value)}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Configurações Avançadas */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#374151', marginBottom: '12px' }}>Configurações Avançadas</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Regra de Acumulação</label>
                    <select value={formData.stacking_rule} onChange={e => setFormData({...formData, stacking_rule: e.target.value})}>
                      <option value="exclusive">Exclusivo (não acumula)</option>
                      <option value="additive">Aditivo (acumula com outros)</option>
                      <option value="override">Sobrescreve outros</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Prioridade</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.priority}
                      onChange={e => setFormData({...formData, priority: e.target.value})}
                      placeholder="0 = menor prioridade"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={e => setFormData({...formData, active: e.target.checked})}
                    />
                    Desconto ativo (disponível para uso imediato)
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="button" disabled={loading}>
                  {loading ? "Salvando..." : (editingDiscount ? "Atualizar Desconto" : "Criar Desconto")}
                </button>
                <button type="button" className="button-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Descontos */}
      {loading && discounts.length === 0 ? (
        <p className="loading">Carregando descontos...</p>
      ) : discounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          <p>Nenhum desconto cadastrado. Clique em "+ Novo Desconto" para começar.</p>
        </div>
      ) : (
        <>
          {activeDiscounts.length > 0 && (
            <>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', color: '#374151' }}>Descontos Ativos</h3>
              <div className="discounts-grid">
                {activeDiscounts.map(d => (
                  <div key={d.id} className="discount-card" style={{ borderLeft: '4px solid #16a34a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 style={{ margin: 0 }}>{d.name}</h3>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                        background: '#dcfce7', color: '#16a34a', fontWeight: 'bold'
                      }}>ATIVO</span>
                    </div>
                    <p style={{ color: '#2563eb', fontWeight: 'bold', margin: '8px 0 4px' }}>{formatDiscountValue(d)}</p>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 4px' }}>{formatTarget(d)}</p>
                    {d.min_quantity > 0 && (
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px' }}>Mín.: {d.min_quantity} unidades</p>
                    )}
                    {d.starts_at && (
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px' }}>
                        Vigência: {new Date(d.starts_at).toLocaleDateString('pt-BR')}
                        {d.ends_at ? ` até ${new Date(d.ends_at).toLocaleDateString('pt-BR')}` : ''}
                      </p>
                    )}
                    {d.description && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 8px' }}>{d.description}</p>}
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                      <button className="button" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => openEditModal(d)}>Editar</button>
                      <button className="btn-delete" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => handleDeleteDiscount(d.id)}>Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {inactiveDiscounts.length > 0 && (
            <>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', color: '#9ca3af' }}>Descontos Inativos</h3>
              <div className="discounts-grid">
                {inactiveDiscounts.map(d => (
                  <div key={d.id} className="discount-card" style={{ borderLeft: '4px solid #d1d5db', opacity: 0.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 style={{ margin: 0, color: '#9ca3af' }}>{d.name}</h3>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                        background: '#f3f4f6', color: '#9ca3af', fontWeight: 'bold'
                      }}>INATIVO</span>
                    </div>
                    <p style={{ color: '#9ca3af', margin: '8px 0 4px' }}>{formatDiscountValue(d)}</p>
                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 8px' }}>{formatTarget(d)}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                      <button className="button" style={{ padding: '4px 12px', fontSize: '12px', background: '#9ca3af' }} onClick={() => openEditModal(d)}>Editar</button>
                      <button className="btn-delete" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => handleDeleteDiscount(d.id)}>Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
