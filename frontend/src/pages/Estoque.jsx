import { useState, useEffect, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Estoque.css";

export function Estoque() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [movement, setMovement] = useState({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });

  const [newProduct, setNewProduct] = useState({
    name: "", category_id: "", supplier_id: "", price: "", avg_cost: "", min_stock: "", unit_type: "un"
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, categoriesData, suppliersData] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories"),
        apiFetch("/suppliers")
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
    } catch (err) { 
      setError("Erro ao carregar estoque: " + err.message); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    loadData(); 
  }, [loadData]);

  const handleCreateProduct = async () => {
    try {
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(newProduct)
      });
      setSuccessMessage("Produto cadastrado!");
      setShowNewProductModal(false);
      setNewProduct({ name: "", category_id: "", supplier_id: "", price: "", avg_cost: "", min_stock: "", unit_type: "un" });
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
      setSuccessMessage(`Preço de ${product.name} atualizado!`);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleStockMovement = async () => {
    if (!selectedProduct || !movement.quantity) return;
    try {
      const qty = parseFloat(movement.quantity);
      const endpoint = movement.type === "loss" ? "/stock/loss" : "/stock/adjust";
      const body = {
        product_id: selectedProduct.id,
        [movement.type === "loss" ? "quantity" : "delta"]: movement.type === "inbound" ? qty : -qty,
        reason: movement.reason,
        unit_cost: movement.type === "inbound" ? movement.unit_cost : 0
      };
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      setSuccessMessage("Movimentação registrada e custo médio atualizado!");
      setShowMovementModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const criticalItems = products.filter(p => Number(p.current_stock) <= Number(p.min_stock)).length;

  return (
    <PageShell title="Controle de Estoque" subtitle="Gestão de Produtos, Preços e Margens">
      <div className="stock-container">
        <div className="card-grid">
          <div className="card">
            <h3>Itens Críticos</h3>
            <strong className={`value-large ${criticalItems > 0 ? 'critical' : ''}`}>{criticalItems}</strong>
          </div>
          <div className="card">
            <h3>Total de Produtos</h3>
            <strong className="value-large">{products.length}</strong>
          </div>
          <div className="card">
            <h3>Valor em Estoque</h3>
            <strong className="value-large">R$ {products.reduce((acc, p) => acc + (p.current_stock * p.avg_cost), 0).toFixed(2)}</strong>
          </div>
        </div>

        {successMessage && <div className="success-message">{successMessage}</div>}
        {error && <div className="error-message">{error}</div>}
        
        <div className="tabs">
          <button className={`tab ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>Inventário</button>
          <button className={`tab ${activeTab === "categories" ? "active" : ""}`} onClick={() => setActiveTab("categories")}>Categorias</button>
          <button className={`tab ${activeTab === "suppliers" ? "active" : ""}`} onClick={() => setActiveTab("suppliers")}>Fornecedores</button>
        </div>

        {activeTab === "inventory" && (
          <div className="tab-content">
            <div className="inventory-header" style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input 
                type="search" 
                placeholder="Buscar produto por nome..." 
                className="search-input"
                style={{ flex: 1 }}
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
              <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
            </div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Estoque</th>
                    <th>Custo Médio</th>
                    <th>Preço Venda</th>
                    <th>Margem</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="7" className="loading">Carregando...</td></tr>
                  ) : products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const price = Number(p.price || 0);
                    const avgCost = Number(p.avg_cost || 0);
                    const currentMargin = price > 0 ? ((price - avgCost) / price * 100) : 0;
                    const targetMargin = p.category_margin || 30;
                    const isLowMargin = currentMargin < targetMargin;

                    return (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.category_name || '-'}</td>
                        <td>
                          <span className={`status ${Number(p.current_stock) <= Number(p.min_stock) ? 'critical' : 'ok'}`}>
                            {p.current_stock} {p.unit_type}
                          </span>
                        </td>
                        <td>R$ {avgCost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td>
                          <span className={isLowMargin ? "status critical" : "status ok"}>
                            {currentMargin.toFixed(1)}%
                          </span>
                          {isLowMargin && (
                            <button className="btn-action" style={{ marginLeft: '8px', background: 'var(--accent-warning)' }} onClick={() => handleQuickPriceUpdate(p)}>⚡ Ajustar</button>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                            <button className="btn-action" style={{ background: 'var(--accent-danger)' }} onClick={() => { setSelectedProduct(p); setMovement({type: "loss", quantity: "", reason: "Perda", unit_cost: ""}); setShowMovementModal(true); }}>Perda</button>
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

        {showNewProductModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Novo Produto</h2>
              <div className="form-group">
                <label>Nome</label>
                <input type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="input" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Categoria</label>
                  <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input">
                    <option value="">Selecione...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Unidade</label>
                  <select value={newProduct.unit_type} onChange={e => setNewProduct({...newProduct, unit_type: e.target.value})} className="input">
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilo (kg)</option>
                    <option value="cx">Caixa (cx)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Preço de Venda</label>
                  <input type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" />
                </div>
                <div className="form-group">
                  <label>Custo Inicial</label>
                  <input type="number" value={newProduct.avg_cost} onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} className="input" />
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn-primary" onClick={handleCreateProduct}>Salvar</button>
                <button className="btn-secondary" onClick={() => setShowNewProductModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {showMovementModal && selectedProduct && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>{movement.type === 'inbound' ? '📦 Entrada de Estoque' : '🍎 Registro de Perda'}</h2>
              <p className="modal-subtitle">{selectedProduct.name}</p>
              <div className="form-group">
                <label>Quantidade ({selectedProduct.unit_type})</label>
                <input type="number" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" />
              </div>
              {movement.type === 'inbound' && (
                <div className="form-group">
                  <label>Custo da Unidade (R$)</label>
                  <input type="number" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} className="input" />
                </div>
              )}
              <div className="form-group">
                <label>Motivo</label>
                <input value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} className="input" />
              </div>
              <div className="modal-actions">
                  <button className="btn-primary" onClick={handleStockMovement}>Confirmar</button>
                  <button className="btn-secondary" onClick={() => setShowMovementModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
