import { useState, useEffect, useCallback } from "react";
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
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [newProduct, setNewProduct] = useState({
    name: "",
    category_id: "",
    supplier_id: "",
    price: "",
    avg_cost: "",
    product_profit_margin: "30",
    current_stock: "",
    min_stock: "",
    unit_type: "un"
  });

  const [movement, setMovement] = useState({
    type: "loss",
    quantity: "",
    reason: "Quebra Visual",
    unit_cost: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, categoriesData, suppliersData, suggestionsData] =
        await Promise.all([
          apiFetch("/products"),
          apiFetch("/categories"),
          apiFetch("/suppliers"),
          apiFetch("/stock/restock-suggestions"),
        ]);
      setProducts(productsData || []);
      setCategories(categoriesData || []);
      setSuppliers(suppliersData || []);
      setRestockSuggestions(suggestionsData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const calculateStockAge = (lastInbound) => {
    if (!lastInbound) return "Novo";
    const diff = Math.floor((new Date() - new Date(lastInbound)) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Ontem";
    return `${diff} dias`;
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
      setSuccessMessage("Registrado com sucesso!");
      setShowMovementModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  return (
    <PageShell title="Estoque" subtitle="Gestão de Produtos e Perdas">
      <div className="estoque-tabs">
        <button className={activeTab === "inventory" ? "active" : ""} onClick={() => setActiveTab("inventory")}>Inventário</button>
        <button className={activeTab === "alerts" ? "active" : ""} onClick={() => setActiveTab("alerts")}>
          Reposição {restockSuggestions.length > 0 && <span className="badge">{restockSuggestions.length}</span>}
        </button>
      </div>

      {activeTab === "inventory" && (
        <div className="tab-content">
          <div className="inventory-header">
            <input type="search" placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
          </div>
          
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Estoque</th>
                <th>Preço</th>
                <th>Idade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className={p.current_stock <= p.min_stock ? "text-danger" : ""}>{p.current_stock} {p.unit_type}</td>
                  <td>R$ {p.price.toFixed(2)}</td>
                  <td><span className={`age-tag ${parseInt(calculateStockAge(p.last_inbound)) > 3 ? 'old' : 'fresh'}`}>{calculateStockAge(p.last_inbound)}</span></td>
                  <td>
                    <button className="btn-small" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                    <button className="btn-small btn-danger" onClick={() => { setSelectedProduct(p); setMovement({type: "loss", quantity: "", reason: "Quebra Visual", unit_cost: ""}); setShowMovementModal(true); }}>Perda</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showMovementModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{movement.type === 'loss' ? '🍎 Registrar Perda' : '📦 Registrar Entrada'}</h3>
            <p>Produto: <strong>{selectedProduct.name}</strong></p>
            <div className="form-group">
                <label>Quantidade ({selectedProduct.unit_type})</label>
                <input type="number" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} autoFocus />
            </div>
            {movement.type === 'inbound' && (
                <div className="form-group">
                    <label>Custo Unitário (R$)</label>
                    <input type="number" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} />
                </div>
            )}
            <div className="form-group">
                <label>Motivo</label>
                <input value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} />
            </div>
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
