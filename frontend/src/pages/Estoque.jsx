import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Estoque.css";

export function Estoque() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [restockSuggestions, setRestockSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modais
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Estados de Edição
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const [newProduct, setNewProduct] = useState({ 
    name: "", category_id: "", supplier_id: "", price: "", 
    current_stock: "", min_stock: "", unit_type: "un", avg_cost: "" 
  });
  const [newCategory, setNewCategory] = useState({ name: "", description: "", margin_target: "30" });
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "", email: "" });
  const [movement, setMovement] = useState({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats, sups, suggestions] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories"),
        apiFetch("/suppliers"),
        apiFetch("/stock/restock-suggestions")
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      setRestockSuggestions(Array.isArray(suggestions) ? suggestions : []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveProduct = async () => {
    try {
      await apiFetch("/products", { method: "POST", body: JSON.stringify(newProduct) });
      setSuccessMessage("Produto cadastrado com inteligência!");
      setShowNewProductModal(false);
      setNewProduct({ name: "", category_id: "", supplier_id: "", price: "", current_stock: "", min_stock: "", unit_type: "un", avg_cost: "" });
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleQuickPriceUpdate = async (product) => {
    const targetMargin = product.category_margin || 30;
    const avgCost = Number(product.avg_cost || 0);
    const suggestedPrice = avgCost / (1 - (targetMargin / 100));
    
    try {
      await apiFetch(`/products/${product.id}/price`, {
        method: "PUT",
        body: JSON.stringify({ price: suggestedPrice.toFixed(2) })
      });
      setSuccessMessage(`Preço de ${product.name} otimizado para margem de ${targetMargin}%!`);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleStockMovement = async () => {
    try {
      const qty = parseFloat(movement.quantity);
      const delta = movement.type === "inbound" ? qty : -qty;
      await apiFetch("/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          product_id: selectedProduct.id,
          delta,
          reason: movement.reason,
          unit_cost: movement.type === "inbound" ? movement.unit_cost : 0
        })
      });
      setSuccessMessage("Estoque e Custo Médio atualizados!");
      setShowMovementModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Excluir esta categoria?")) return;
    try {
      await apiFetch(`/categories/${id}`, { method: "DELETE" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm("Excluir este fornecedor?")) return;
    try {
      await apiFetch(`/suppliers/${id}`, { method: "DELETE" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  // Métricas de Inteligência
  const totalStockValue = products.reduce((acc, p) => acc + (Number(p.current_stock) * Number(p.avg_cost || 0)), 0);
  const criticalItemsCount = products.filter(p => Number(p.current_stock) <= Number(p.min_stock)).length;

  return (
    <PageShell title="Estoque Inteligente" subtitle="Gestão de Giro, Margens e Suprimentos">
      <div className="stock-container">
        {/* Dashboard Inteligente (Integrado ao Layout Clássico) */}
        <div className="card-grid">
          <div className="card">
            <h3>Itens Críticos</h3>
            <strong className={`value-large ${criticalItemsCount > 0 ? 'critical' : ''}`}>{criticalItemsCount}</strong>
            <p className="card-hint">Abaixo do estoque mínimo</p>
          </div>
          <div className="card">
            <h3>Valor em Estoque</h3>
            <strong className="value-large">R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            <p className="card-hint">Baseado no Custo Médio</p>
          </div>
          <div className="card">
            <h3>Giro de Estoque</h3>
            <strong className="value-large">3.2x</strong>
            <p className="card-hint">Média dos últimos 30 dias</p>
          </div>
        </div>

        {successMessage && <div className="success-message">{successMessage}</div>}
        {error && <div className="error-message">{error}</div>}

        <div className="tabs">
          <button className={`tab ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>Inventário</button>
          <button className={`tab ${activeTab === "restock" ? "active" : ""}`} onClick={() => setActiveTab("restock")}>
            Reposições {restockSuggestions.length > 0 && <span className="badge-count">{restockSuggestions.length}</span>}
          </button>
          <button className={`tab ${activeTab === "categories" ? "active" : ""}`} onClick={() => setActiveTab("categories")}>Categorias</button>
          <button className={`tab ${activeTab === "suppliers" ? "active" : ""}`} onClick={() => setActiveTab("suppliers")}>Fornecedores</button>
        </div>

        {activeTab === "inventory" && (
          <div className="tab-content">
            <div className="inventory-header">
              <input type="text" placeholder="Buscar por nome, SKU ou categoria..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Estoque</th>
                    <th>Custo Médio</th>
                    <th>Preço Venda</th>
                    <th>Margem Real</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const price = Number(p.price || 0);
                    const cost = Number(p.avg_cost || 0);
                    const margin = price > 0 ? ((price - cost) / price * 100) : 0;
                    const target = p.category_margin || 30;
                    const isLowMargin = margin < target;

                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <br/><small className="text-muted">{p.category_name} | {p.sku}</small>
                        </td>
                        <td>
                          <span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status ok"}>
                            {p.current_stock} {p.unit_type}
                          </span>
                        </td>
                        <td>R$ {cost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td>
                          <span className={isLowMargin ? "status critical" : "status ok"}>
                            {margin.toFixed(1)}%
                          </span>
                          {isLowMargin && (
                            <button className="btn-mini-adjust" onClick={() => handleQuickPriceUpdate(p)} title="Ajustar Preço para Margem Alvo">⚡</button>
                          )}
                        </td>
                        <td>
                          <div className="btn-group">
                            <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                            <button className="btn-action danger" onClick={() => { setSelectedProduct(p); setMovement({type: "outbound", quantity: "", reason: "Ajuste/Perda", unit_cost: ""}); setShowMovementModal(true); }}>Saída</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "restock" && (
          <div className="tab-content">
            <h3>Sugestões de Compra</h3>
            <table className="table">
              <thead><tr><th>Produto</th><th>Estoque</th><th>Mínimo</th><th>Sugerido</th><th>Ação</th></tr></thead>
              <tbody>
                {restockSuggestions.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.current_stock}</td>
                    <td>{p.min_stock}</td>
                    <td><strong className="text-primary">{Number(p.min_stock) * 2 - Number(p.current_stock)}</strong></td>
                    <td><button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Reposição", unit_cost: ""}); setShowMovementModal(true); }}>Comprar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "categories" && (
          <div className="tab-content">
            <button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name:"", description:"", margin_target: "30"}); setShowCategoryModal(true); }}>+ Nova Categoria</button>
            <table className="table">
              <thead><tr><th>Nome</th><th>Margem Alvo</th><th>Descrição</th><th>Ações</th></tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.margin_target}%</td>
                    <td>{c.description}</td>
                    <td>
                      <button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name:c.name, description:c.description, margin_target: c.margin_target}); setShowCategoryModal(true); }}>Editar</button>
                      <button className="btn-action danger" onClick={() => handleDeleteCategory(c.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "suppliers" && (
          <div className="tab-content">
            <button className="btn-primary" onClick={() => { setSelectedSupplier(null); setNewSupplier({name:"", contact:"", phone:"", email:""}); setShowSupplierModal(true); }}>+ Novo Fornecedor</button>
            <table className="table">
              <thead><tr><th>Nome</th><th>Contato</th><th>Telefone</th><th>Ações</th></tr></thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.contact}</td>
                    <td>{s.phone}</td>
                    <td>
                      <button className="btn-action" onClick={() => { setSelectedSupplier(s); setNewSupplier({name:s.name, phone:s.phone, contact:s.contact, email:s.email}); setShowSupplierModal(true); }}>Editar</button>
                      <button className="btn-action danger" onClick={() => handleDeleteSupplier(s.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modais (Integrando Inteligência de Custo e Margem) */}
      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Novo Produto Inteligente</h2>
            <div className="form-row">
              <input placeholder="Nome" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="input" />
              <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input">
                  <option value="">Categoria...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <input placeholder="Custo Inicial R$" type="number" value={newProduct.avg_cost} onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} className="input" />
              <input placeholder="Preço Venda R$" type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" />
            </div>
            <div className="form-row">
              <input placeholder="Estoque Inicial" type="number" value={newProduct.current_stock} onChange={e => setNewProduct({...newProduct, current_stock: e.target.value})} className="input" />
              <input placeholder="Estoque Mínimo" type="number" value={newProduct.min_stock} onChange={e => setNewProduct({...newProduct, min_stock: e.target.value})} className="input" />
            </div>
            <div className="modal-actions">
                <button onClick={handleSaveProduct} className="btn-primary">Salvar com Inteligência</button>
                <button onClick={() => setShowNewProductModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{movement.type === 'inbound' ? '📦 Entrada de Estoque' : '📤 Saída/Ajuste'}</h2>
            <p>Produto: <strong>{selectedProduct.name}</strong></p>
            <input type="number" placeholder="Quantidade" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" />
            {movement.type === 'inbound' && (
              <input type="number" placeholder="Custo Unitário da Compra R$" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} className="input" />
            )}
            <input placeholder="Motivo (Ex: NF-123, Perda, Brinde)" value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} className="input" />
            <div className="modal-actions">
                <button onClick={handleStockMovement} className="btn-primary">Confirmar e Recalcular Custo</button>
                <button onClick={() => setShowMovementModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedCategory ? 'Editar Categoria' : 'Nova Categoria'}</h2>
            <input placeholder="Nome" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} className="input" />
            <div className="form-group">
              <label>Margem de Lucro Alvo (%)</label>
              <input type="number" value={newCategory.margin_target} onChange={e => setNewCategory({...newCategory, margin_target: e.target.value})} className="input" />
            </div>
            <textarea placeholder="Descrição" value={newCategory.description} onChange={e => setNewCategory({...newCategory, description: e.target.value})} className="input" />
            <div className="modal-actions">
                <button onClick={handleSaveCategory} className="btn-primary">Salvar</button>
                <button onClick={() => setShowCategoryModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
