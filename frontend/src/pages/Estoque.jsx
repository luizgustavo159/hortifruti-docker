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

  const [newProduct, setNewProduct] = useState({ name: "", category_id: "", supplier_id: "", price: "", current_stock: "", min_stock: "", unit_type: "un", avg_cost: "" });
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "", email: "" });
  const [movement, setMovement] = useState({ type: "adjust", quantity: "", reason: "", unit_cost: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats, sups] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories"),
        apiFetch("/suppliers")
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      
      // Simulação de sugestão de reposição baseada no estoque mínimo
      const suggestions = (Array.isArray(prods) ? prods : []).filter(p => Number(p.current_stock) <= Number(p.min_stock));
      setRestockSuggestions(suggestions);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveProduct = async () => {
    try {
      await apiFetch("/products", { method: "POST", body: JSON.stringify(newProduct) });
      setSuccessMessage("Produto salvo!");
      setShowNewProductModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveCategory = async () => {
    try {
      const method = selectedCategory ? "PUT" : "POST";
      const url = selectedCategory ? `/categories/${selectedCategory.id}` : "/categories";
      await apiFetch(url, { method, body: JSON.stringify(newCategory) });
      setSuccessMessage("Categoria salva!");
      setShowCategoryModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveSupplier = async () => {
    try {
      const method = selectedSupplier ? "PUT" : "POST";
      const url = selectedSupplier ? `/suppliers/${selectedSupplier.id}` : "/suppliers";
      await apiFetch(url, { method, body: JSON.stringify(newSupplier) });
      setSuccessMessage("Fornecedor salvo!");
      setShowSupplierModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleStockMovement = async () => {
    try {
      const delta = movement.type === "inbound" ? parseFloat(movement.quantity) : -parseFloat(movement.quantity);
      await apiFetch("/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          product_id: selectedProduct.id,
          delta,
          reason: movement.reason,
          unit_cost: movement.unit_cost
        })
      });
      setSuccessMessage("Estoque atualizado!");
      setShowMovementModal(false);
      loadData();
    } catch (err) { setError(err.message); }
  };

  return (
    <PageShell title="Controle de Estoque" subtitle="Gestão de Produtos e Suprimentos">
      <div className="stock-container">
        <div className="card-grid">
          <div className="card"><h3>Itens Críticos</h3><strong className="value-large critical">{restockSuggestions.length}</strong></div>
          <div className="card"><h3>Total Produtos</h3><strong className="value-large">{products.length}</strong></div>
          <div className="card"><h3>Categorias</h3><strong className="value-large">{categories.length}</strong></div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>Inventário</button>
          <button className={`tab ${activeTab === "categories" ? "active" : ""}`} onClick={() => setActiveTab("categories")}>Categorias</button>
          <button className={`tab ${activeTab === "suppliers" ? "active" : ""}`} onClick={() => setActiveTab("suppliers")}>Fornecedores</button>
        </div>

        {activeTab === "inventory" && (
          <div className="tab-content">
            <div className="inventory-header">
              <input type="text" placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
            </div>
            <table className="table">
              <thead>
                <tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Preço</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.category_name}</td>
                    <td><span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status ok"}>{p.current_stock} {p.unit_type}</span></td>
                    <td>R$ {Number(p.price).toFixed(2)}</td>
                    <td>
                        <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Entrada", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "categories" && (
          <div className="tab-content">
            <button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name:"", description:""}); setShowCategoryModal(true); }}>+ Nova Categoria</button>
            <table className="table">
              <thead><tr><th>Nome</th><th>Descrição</th><th>Ações</th></tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.description}</td>
                    <td><button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name:c.name, description:c.description}); setShowCategoryModal(true); }}>Editar</button></td>
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
              <thead><tr><th>Nome</th><th>Contato</th><th>Ações</th></tr></thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.phone}</td>
                    <td><button className="btn-action" onClick={() => { setSelectedSupplier(s); setNewSupplier({name:s.name, phone:s.phone, contact:s.contact, email:s.email}); setShowSupplierModal(true); }}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modais de Cadastro (Simplificados para brevidade, mas com lógica completa) */}
      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Novo Produto</h2>
            <input placeholder="Nome" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="input" />
            <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input">
                <option value="">Categoria...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="Preço" type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" />
            <div className="modal-actions">
                <button onClick={handleSaveProduct} className="btn-primary">Salvar</button>
                <button onClick={() => setShowNewProductModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Movimentar Estoque: {selectedProduct.name}</h2>
            <input type="number" placeholder="Quantidade" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" />
            {movement.type === 'inbound' && <input type="number" placeholder="Custo Unitário R$" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} className="input" />}
            <input placeholder="Motivo" value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} className="input" />
            <div className="modal-actions">
                <button onClick={handleStockMovement} className="btn-primary">Confirmar</button>
                <button onClick={() => setShowMovementModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
