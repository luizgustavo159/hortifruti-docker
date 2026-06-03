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
  const [activeTab, setActiveTab] = useState("inventory");
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [newProduct, setNewProduct] = useState({
    name: "", category_id: "", price: "", avg_cost: "", product_profit_margin: "30", current_stock: "", min_stock: "", unit_type: "un"
  });

  const [movement, setMovement] = useState({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, categoriesData] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories")
      ]);
      setProducts(productsData || []);
      setCategories(categoriesData || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleQuickPriceUpdate = async (product) => {
    const targetMargin = product.category_margin || 30;
    const suggestedPrice = product.avg_cost / (1 - (targetMargin / 100));
    
    try {
      await apiFetch(`/products/${product.id}/price`, {
        method: "PUT",
        body: JSON.stringify({ price: suggestedPrice.toFixed(2) })
      });
      setSuccessMessage(`Preço de ${product.name} atualizado!`);
      loadData();
      setTimeout(() => setSuccessMessage(""), 2000);
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
        unit_cost: movement.type === "inbound" ? parseFloat(movement.unit_cost || 0) : 0
      };
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      setSuccessMessage("Movimentação registrada!");
      setShowMovementModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  return (
    <PageShell title="Estoque" subtitle="Gestão de Produtos e Preços">
      {successMessage && <div className="toast success">{successMessage}</div>}
      
      <div className="inventory-header">
        <input type="search" placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Estoque</th>
            <th>Preço Atual</th>
            <th>Margem</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
            const currentMargin = p.price > 0 ? ((p.price - p.avg_cost) / p.price * 100) : 0;
            const targetMargin = p.category_margin || 30;
            const isLowMargin = currentMargin < targetMargin;
            const suggestedPrice = p.avg_cost / (1 - (targetMargin / 100));

            return (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{p.current_stock} {p.unit_type}</td>
                <td>R$ {p.price.toFixed(2)}</td>
                <td>
                  <span className={isLowMargin ? "text-danger" : "text-success"}>
                    {currentMargin.toFixed(1)}%
                  </span>
                  {isLowMargin && (
                    <button 
                      className="btn-quick-price" 
                      title={`Sugerido: R$ ${suggestedPrice.toFixed(2)}`}
                      onClick={() => handleQuickPriceUpdate(p)}
                    >
                      ⚡ Corrigir
                    </button>
                  )}
                </td>
                <td>
                  <button className="btn-small" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                  <button className="btn-small btn-danger" onClick={() => { setSelectedProduct(p); setMovement({type: "loss", quantity: "", reason: "Quebra Visual", unit_cost: ""}); setShowMovementModal(true); }}>Perda</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showMovementModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{movement.type === 'inbound' ? '📦 Entrada' : '🍎 Perda'} - {selectedProduct.name}</h3>
            <input type="number" placeholder="Quantidade" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} />
            {movement.type === 'inbound' && (
                <input type="number" placeholder="Custo Unitário (R$)" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} />
            )}
            <input placeholder="Motivo" value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} />
            <div className="modal-actions">
                <button className="btn-primary" onClick={handleStockMovement}>Confirmar</button>
                <button onClick={() => setShowMovementModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
