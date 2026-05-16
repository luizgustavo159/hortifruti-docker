import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { hasRequiredRole } from "../lib/auth";
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
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalData, setApprovalData] = useState({ email: "", password: "" });
  const [pendingAction, setPendingAction] = useState(null);

  // Formulários
  const [newProduct, setNewProduct] = useState({
    name: "",
    category_id: "",
    supplier_id: "",
    price: "",
    current_stock: "",
    min_stock: "",
  });

  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "", email: "" });

  const [movement, setMovement] = useState({
    type: "adjust",
    quantity: "",
    reason: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
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
    } catch (loadError) {
      setError(loadError.message || "Falha ao carregar dados de estoque.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.category_id || !newProduct.price || !newProduct.current_stock || !newProduct.min_stock) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const productData = {
        name: newProduct.name,
        category_id: parseInt(newProduct.category_id),
        supplier_id: newProduct.supplier_id ? parseInt(newProduct.supplier_id) : null,
        price: parseFloat(newProduct.price),
        current_stock: parseInt(newProduct.current_stock),
        min_stock: parseInt(newProduct.min_stock),
        sku: `PROD-${Date.now()}`, // Gerar SKU temporário se não houver campo
        unit_type: 'unit'
      };

      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(productData),
      });

      setSuccessMessage("Produto criado com sucesso!");
      setNewProduct({ name: "", category_id: "", supplier_id: "", price: "", current_stock: "", min_stock: "" });
      setShowNewProductModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (createError) {
      setError(createError.message || "Erro ao criar produto.");
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name) return;
    try {
      const res = await apiFetch("/categories", {
        method: "POST",
        body: JSON.stringify(newCategory),
      });
      setCategories([...categories, { id: res.id, ...newCategory }]);
      setNewProduct({ ...newProduct, category_id: res.id });
      setNewCategory({ name: "", description: "" });
      setShowCategoryModal(false);
      setSuccessMessage("Categoria criada!");
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao criar categoria.");
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.name) return;
    try {
      const res = await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify(newSupplier),
      });
      setSuppliers([...suppliers, { id: res.id, ...newSupplier }]);
      setNewProduct({ ...newProduct, supplier_id: res.id });
      setNewSupplier({ name: "", contact: "", phone: "", email: "" });
      setShowSupplierModal(false);
      setSuccessMessage("Fornecedor criado!");
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao criar fornecedor.");
    }
  };

  const handleStockMovement = async (approvalToken = null) => {
    if (!selectedProduct || !movement.quantity || !movement.reason) {
      setError("Preencha todos os campos da movimentação.");
      return;
    }

    if (!hasRequiredRole("supervisor") && !approvalToken) {
      setPendingAction(() => () => handleStockMovement());
      setShowApprovalModal(true);
      return;
    }

    try {
      let endpoint = "/stock/adjust";
      let movementData = {};

      if (movement.type === "loss") {
        endpoint = "/stock/loss";
        movementData = { product_id: selectedProduct.id, quantity: parseInt(movement.quantity), reason: movement.reason };
      } else if (movement.type === "adjust") {
        endpoint = "/stock/adjust";
        movementData = { product_id: selectedProduct.id, delta: parseInt(movement.quantity), reason: movement.reason };
      } else if (movement.type === "move") {
        endpoint = "/stock/move";
        movementData = { product_id: selectedProduct.id, quantity: parseInt(movement.quantity), type: "inbound", reason: movement.reason };
      }

      const headers = approvalToken ? { "x-approval-token": approvalToken } : {};
      await apiFetch(endpoint, { method: "POST", headers, body: JSON.stringify(movementData) });

      setSuccessMessage("Movimentação registrada!");
      setMovement({ type: "adjust", quantity: "", reason: "" });
      setSelectedProduct(null);
      setShowMovementModal(false);
      setShowApprovalModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao registrar movimentação.");
    }
  };

  const criticalItems = products.filter((item) => Number(item.current_stock) <= Number(item.min_stock)).length;

  return (
    <PageShell
      title="Controle de Estoque"
      subtitle="Monitoramento, reposição e movimentações de estoque"
      actions={
        hasRequiredRole("supervisor") && (
          <button className="button" onClick={() => setShowNewProductModal(true)}>
            Novo Produto
          </button>
        )
      }
    >
      <div className="stock-container">
        <div className="card-grid">
          <div className="card"><h3>Itens Críticos</h3><strong>{criticalItems}</strong></div>
          <div className="card"><h3>Reposições Sugeridas</h3><strong>{restockSuggestions.length}</strong></div>
          <div className="card"><h3>Total de Produtos</h3><strong>{products.length}</strong></div>
          <div className="card"><h3>Fornecedores</h3><strong>{suppliers.length}</strong></div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        <div className="tabs">
          <button className={`tab ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>Inventário</button>
          <button className={`tab ${activeTab === "restock" ? "active" : ""}`} onClick={() => setActiveTab("restock")}>Reposições</button>
        </div>

        {activeTab === "inventory" && (
          <div className="tab-content">
            <div className="search-section">
              <input type="text" placeholder="Buscar produtos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Mínimo</th><th>Status</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category_name || "-"}</td>
                      <td>R$ {Number(product.price).toFixed(2)}</td>
                      <td>{product.current_stock}</td>
                      <td>{product.min_stock}</td>
                      <td><span className={`status ${Number(product.current_stock) <= Number(product.min_stock) ? "critical" : "ok"}`}>{Number(product.current_stock) <= Number(product.min_stock) ? "Crítico" : "OK"}</span></td>
                      <td><button className="btn-action" onClick={() => { setSelectedProduct(product); setShowMovementModal(true); }}>Movimentar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo Produto */}
      {showNewProductModal && (
        <div className="modal-overlay" onClick={() => setShowNewProductModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Novo Produto</h2>
            <div className="form-group">
              <label>Nome do Produto *</label>
              <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Ex: Maçã Fuji" />
            </div>

            <div className="form-group">
              <label>Categoria *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select style={{ flex: 1 }} value={newProduct.category_id} onChange={(e) => setNewProduct({ ...newProduct, category_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn-action" onClick={() => setShowCategoryModal(true)}>+</button>
              </div>
            </div>

            <div className="form-group">
              <label>Fornecedor</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select style={{ flex: 1 }} value={newProduct.supplier_id} onChange={(e) => setNewProduct({ ...newProduct, supplier_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn-action" onClick={() => setShowSupplierModal(true)}>+</button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group"><label>Preço *</label><input type="number" step="0.01" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} /></div>
              <div className="form-group"><label>Estoque *</label><input type="number" value={newProduct.current_stock} onChange={(e) => setNewProduct({ ...newProduct, current_stock: e.target.value })} /></div>
              <div className="form-group"><label>Mínimo *</label><input type="number" value={newProduct.min_stock} onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })} /></div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreateProduct}>Criar</button>
              <button className="btn-secondary" onClick={() => setShowNewProductModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nova Categoria */}
      {showCategoryModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal">
            <h2>Nova Categoria</h2>
            <form onSubmit={handleCreateCategory}>
              <div className="form-group"><label>Nome *</label><input autoFocus type="text" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} required /></div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Salvar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>Voltar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Fornecedor */}
      {showSupplierModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal">
            <h2>Novo Fornecedor</h2>
            <form onSubmit={handleCreateSupplier}>
              <div className="form-group"><label>Nome *</label><input autoFocus type="text" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} required /></div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Salvar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowSupplierModal(false)}>Voltar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Movimentação */}
      {showMovementModal && selectedProduct && (
        <div className="modal-overlay" onClick={() => setShowMovementModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Movimentar Estoque</h2>
            <p className="modal-subtitle">{selectedProduct.name}</p>
            <div className="form-group">
              <label>Tipo</label>
              <select value={movement.type} onChange={e => setMovement({...movement, type: e.target.value})}>
                <option value="adjust">Ajuste</option>
                <option value="loss">Perda</option>
              </select>
            </div>
            <div className="form-group"><label>Quantidade</label><input type="number" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} /></div>
            <div className="form-group"><label>Motivo</label><textarea value={movement.reason} onChange={e => setMovement({...movement, reason: e.target.value})} /></div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => handleStockMovement()}>Registrar</button>
              <button className="btn-secondary" onClick={() => setShowMovementModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
