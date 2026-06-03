import { useState, useEffect, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Estoque.css";

export function Estoque() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [movement, setMovement] = useState({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, categoriesData] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories")
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (err) { 
      setError("Erro ao carregar estoque: " + err.message); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    loadData(); 
  }, [loadData]);

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
    } catch (err) { 
      setError(err.message); 
    }
  };

  const handleStockMovement = async () => {
    if (!selectedProduct || !movement.quantity) return;
    try {
      const qty = parseFloat(movement.quantity);
      const endpoint = movement.type === "loss" ? "/stock/loss" : "/stock/adjust";
      const body = {
        product_id: selectedProduct.id,
        [movement.type === "loss" ? "quantity" : "delta"]: movement.type === "inbound" ? qty : -qty,
        reason: movement.reason
      };
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      setSuccessMessage("Movimentação registrada com sucesso!");
      setShowMovementModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { 
      setError(err.message); 
    }
  };

  return (
    <PageShell title="Estoque" subtitle="Gestão de Produtos e Controle de Preços">
      <div className="stock-container">
        {successMessage && <div className="success-message">{successMessage}</div>}
        {error && <div className="error-message">{error}</div>}
        
        <div className="search-section" style={{ marginBottom: '20px' }}>
          <input 
            type="search" 
            placeholder="Buscar por nome ou SKU..." 
            className="search-input"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Estoque Atual</th>
                <th>Preço de Venda</th>
                <th>Margem Real</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="loading">Carregando estoque...</td></tr>
              ) : products.filter(p => 
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (p.sku && p.sku.includes(searchTerm))
              ).length === 0 ? (
                <tr><td colSpan="6" className="no-data">Nenhum produto encontrado.</td></tr>
              ) : (
                products.filter(p => 
                  p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  (p.sku && p.sku.includes(searchTerm))
                ).map(p => {
                  const price = Number(p.price || 0);
                  const avgCost = Number(p.avg_cost || 0);
                  const currentMargin = price > 0 ? ((price - avgCost) / price * 100) : 0;
                  const targetMargin = p.category_margin || 30;
                  const isLowMargin = currentMargin < targetMargin;
                  const suggestedPrice = avgCost / (1 - (targetMargin / 100));

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>SKU: {p.sku}</div>
                      </td>
                      <td>{p.category_name || '-'}</td>
                      <td>
                        <span className={`status ${Number(p.current_stock) <= Number(p.min_stock) ? 'critical' : 'ok'}`}>
                          {p.current_stock} {p.unit_type}
                        </span>
                      </td>
                      <td>R$ {price.toFixed(2)}</td>
                      <td>
                        <span className={isLowMargin ? "status critical" : "status ok"}>
                          {currentMargin.toFixed(1)}%
                        </span>
                        {isLowMargin && price > 0 && (
                          <button 
                            className="btn-action" 
                            style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '10px', background: 'var(--accent-warning)' }}
                            title={`Sugerido: R$ ${suggestedPrice.toFixed(2)}`}
                            onClick={() => handleQuickPriceUpdate(p)}
                          >
                            ⚡ Ajustar
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                          <button className="btn-action" style={{ background: 'var(--accent-danger)' }} onClick={() => { setSelectedProduct(p); setMovement({type: "loss", quantity: "", reason: "Perda/Quebra", unit_cost: ""}); setShowMovementModal(true); }}>Perda</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {showMovementModal && selectedProduct && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>{movement.type === 'inbound' ? '📦 Entrada de Estoque' : '🍎 Registro de Perda'}</h2>
              <p className="modal-subtitle">{selectedProduct.name}</p>
              
              <div className="form-group">
                <label>Quantidade ({selectedProduct.unit_type})</label>
                <input 
                  type="number" 
                  placeholder="Ex: 10" 
                  value={movement.quantity} 
                  onChange={e => setMovement({...movement, quantity: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Motivo</label>
                <input 
                  placeholder="Ex: Compra do fornecedor, Quebra visual..." 
                  value={movement.reason} 
                  onChange={e => setMovement({...movement, reason: e.target.value})} 
                />
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
