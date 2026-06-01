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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
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
    unit_type: "un",
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
      const isKg = newProduct.unit_type === 'kg';
      const productData = {
        name: newProduct.name,
        category_id: parseInt(newProduct.category_id),
        supplier_id: newProduct.supplier_id ? parseInt(newProduct.supplier_id) : null,
        price: parseFloat(newProduct.price),
        current_stock: isKg ? parseFloat(newProduct.current_stock) : parseInt(newProduct.current_stock),
        min_stock: isKg ? parseFloat(newProduct.min_stock) : parseInt(newProduct.min_stock),
        sku: `PROD-${Date.now()}`,
        unit_type: newProduct.unit_type || 'un'
      };

      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(productData),
      });

      setSuccessMessage("Produto criado com sucesso!");
      setNewProduct({ name: "", category_id: "", supplier_id: "", price: "", current_stock: "", min_stock: "", unit_type: "un" });
      setShowNewProductModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (createError) {
      setError(createError.message || "Erro ao criar produto.");
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name) return;
    try {
      if (selectedCategory) {
        await apiFetch(`/categories/${selectedCategory.id}`, {
          method: "PUT",
          body: JSON.stringify(newCategory),
        });
        setSuccessMessage("Categoria atualizada!");
      } else {
        const res = await apiFetch("/categories", {
          method: "POST",
          body: JSON.stringify(newCategory),
        });
        setNewProduct({ ...newProduct, category_id: res.id });
        setSuccessMessage("Categoria criada!");
      }
      setNewCategory({ name: "", description: "" });
      setSelectedCategory(null);
      setShowCategoryModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao salvar categoria.");
    }
  };

  const handleDeleteCategory = async (id, approvalToken = null) => {
    if (!approvalToken) {
      if (!window.confirm("Tem certeza que deseja excluir esta categoria? Esta ação requer senha de gerente.")) return;
      setPendingAction(() => (token) => handleDeleteCategory(id, token));
      setShowApprovalModal(true);
      return;
    }
    try {
      await apiFetch(`/categories/${id}`, { 
        method: "DELETE",
        headers: { "x-approval-token": approvalToken }
      });
      setSuccessMessage("Categoria excluída!");
      loadData();
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao excluir categoria.");
    }
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.name) return;
    try {
      if (selectedSupplier) {
        await apiFetch(`/suppliers/${selectedSupplier.id}`, {
          method: "PUT",
          body: JSON.stringify(newSupplier),
        });
        setSuccessMessage("Fornecedor atualizado!");
      } else {
        const res = await apiFetch("/suppliers", {
          method: "POST",
          body: JSON.stringify(newSupplier),
        });
        setNewProduct({ ...newProduct, supplier_id: res.id });
        setSuccessMessage("Fornecedor criado!");
      }
      setNewSupplier({ name: "", contact: "", phone: "", email: "" });
      setSelectedSupplier(null);
      setShowSupplierModal(false);
      loadData();
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao salvar fornecedor.");
    }
  };

  const handleDeleteSupplier = async (id, approvalToken = null) => {
    if (!approvalToken) {
      if (!window.confirm("Tem certeza que deseja excluir este fornecedor? Esta ação requer senha de gerente.")) return;
      setPendingAction(() => (token) => handleDeleteSupplier(id, token));
      setShowApprovalModal(true);
      return;
    }
    try {
      await apiFetch(`/suppliers/${id}`, { 
        method: "DELETE",
        headers: { "x-approval-token": approvalToken }
      });
      setSuccessMessage("Fornecedor excluído!");
      loadData();
      setTimeout(() => setSuccessMessage(""), 2000);
    } catch (err) {
      setError(err.message || "Erro ao excluir fornecedor.");
    }
  };

  const handleStockMovement = async (approvalToken = null) => {
    if (!selectedProduct || !movement.quantity || !movement.reason) {
      setError("Preencha todos os campos da movimentação.");
      return;
    }

    const isKgProduct = selectedProduct?.unit_type === 'kg';
    const qty = isKgProduct ? parseFloat(movement.quantity) : parseInt(movement.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("A quantidade deve ser um número positivo.");
      return;
    }

    if (!hasRequiredRole("supervisor") && !approvalToken) {
      setPendingAction(() => (token) => handleStockMovement(token));
      setShowApprovalModal(true);
      return;
    }

    try {
      let endpoint = "/stock/adjust";
      let movementData = {};

      if (movement.type === "loss") {
        // Perda: sempre envia quantidade positiva, o backend subtrai
        endpoint = "/stock/loss";
        movementData = {
          product_id: selectedProduct.id,
          quantity: qty,
          reason: movement.reason
        };
      } else if (movement.type === "adjust") {
        // Ajuste: pode ser positivo (entrada) ou negativo (saída)
        endpoint = "/stock/adjust";
        movementData = {
          product_id: selectedProduct.id,
          delta: qty,
          reason: movement.reason
        };
      } else if (movement.type === "adjust_negative") {
        // Ajuste negativo: reduz o estoque
        endpoint = "/stock/adjust";
        movementData = {
          product_id: selectedProduct.id,
          delta: -qty,
          reason: movement.reason
        };
      } else if (movement.type === "move") {
        endpoint = "/stock/move";
        movementData = {
          product_id: selectedProduct.id,
          quantity: qty,
          type: "inbound",
          reason: movement.reason
        };
      }

      const headers = approvalToken ? { "x-approval-token": approvalToken } : {};
      await apiFetch(endpoint, { method: "POST", headers, body: JSON.stringify(movementData) });

      setSuccessMessage("Movimentação registrada com sucesso!");
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

  const handleApprovalSubmit = async (e) => {
    e.preventDefault();
    try {
      // Determinar a ação correta baseada no que estamos tentando fazer
      // Se houver uma ação pendente, precisamos saber qual era o contexto
      // No caso do Estoque, as ações sensíveis são stock_adjust, user_update, etc.
      // Para categorias e fornecedores, usaremos 'user_update' ou 'admin' como fallback de segurança
      // Determinar a ação correta baseada no contexto
      let action = "user_update";
      if (showMovementModal) {
        action = "stock_adjust";
      }

      const res = await apiFetch("/approvals", {
        method: "POST",
        body: JSON.stringify({
          email: approvalData.email,
          password: approvalData.password,
          action: action,
        }),
      });
      setShowApprovalModal(false);
      setApprovalData({ email: "", password: "" });
      if (pendingAction) {
        pendingAction(res.token);
        setPendingAction(null);
      }
    } catch (err) {
      setError(err.message || "Aprovação inválida.");
    }
  };

  const criticalItems = products.filter((item) => Number(item.current_stock) <= Number(item.min_stock)).length;

  const getRestockQuantity = (product) => {
    const max = Number(product.max_stock) || Number(product.min_stock) * 3;
    return Math.max(0, max - Number(product.current_stock));
  };

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
          <div className="card">
            <h3>Itens Críticos</h3>
            <strong className={`value-large ${criticalItems > 0 ? 'critical' : ''}`}>{criticalItems}</strong>
          </div>
          <div className="card">
            <h3>Reposições Sugeridas</h3>
            <strong className={`value-large ${restockSuggestions.length > 0 ? 'warning' : ''}`}>{restockSuggestions.length}</strong>
          </div>
          <div className="card">
            <h3>Total de Produtos</h3>
            <strong className="value-large">{products.length}</strong>
          </div>
          <div className="card">
            <h3>Fornecedores</h3>
            <strong className="value-large">{suppliers.length}</strong>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

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
            <div className="search-section">
              <input
                type="text"
                placeholder="Buscar produtos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            {loading ? (
              <p className="loading">Carregando produtos...</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                    <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Unidade</th>
                      <th>Categoria</th>
                      <th>Fornecedor</th>
                      <th>Preço</th>
                      <th>Estoque</th>
                      <th>Mínimo</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>Nenhum produto encontrado.</td></tr>
                    ) : filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.name}</strong>
                          {product.unit_type === 'kg' && <span style={{ marginLeft: '6px', fontSize: '11px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '10px' }}>⚖️ kg</span>}
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', background: '#f3f4f6', padding: '2px 8px', borderRadius: '10px' }}>
                            {product.unit_type || 'un'}
                          </span>
                        </td>
                        <td>{product.category_name || "-"}</td>
                        <td>{product.supplier_name || "-"}</td>
                        <td>R$ {Number(product.price).toFixed(2)}/{product.unit_type === 'kg' ? 'kg' : 'un'}</td>
                        <td>
                          <span style={{ fontWeight: 'bold', color: Number(product.current_stock) <= Number(product.min_stock) ? '#dc2626' : '#16a34a' }}>
                            {product.unit_type === 'kg'
                              ? `${Number(product.current_stock).toFixed(3)} kg`
                              : product.current_stock}
                          </span>
                        </td>
                        <td>{product.unit_type === 'kg' ? `${Number(product.min_stock).toFixed(3)} kg` : product.min_stock}</td>
                        <td>
                          <span className={`status ${Number(product.current_stock) <= Number(product.min_stock) ? "critical" : "ok"}`}>
                            {Number(product.current_stock) <= Number(product.min_stock) ? "⚠ Crítico" : "✓ OK"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-action"
                            onClick={() => {
                              setSelectedProduct(product);
                              setMovement({ type: "adjust", quantity: "", reason: "" });
                              setShowMovementModal(true);
                            }}
                          >
                            Movimentar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "restock" && (
          <div className="tab-content">
            {loading ? (
              <p className="loading">Carregando sugestões...</p>
            ) : restockSuggestions.length === 0 ? (
              <div className="empty-state">
                <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  ✅ Todos os produtos estão com estoque adequado. Nenhuma reposição necessária.
                </p>
              </div>
            ) : (
              <>
                <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
                  {restockSuggestions.length} produto(s) abaixo do estoque mínimo precisam de reposição.
                </p>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Fornecedor</th>
                        <th>Estoque Atual</th>
                        <th>Estoque Mínimo</th>
                        <th>Qtd. Sugerida</th>
                        <th>Urgência</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restockSuggestions.map((product) => {
                        const deficit = Number(product.min_stock) - Number(product.current_stock);
                        const urgency = Number(product.current_stock) === 0 ? "Crítico" :
                          deficit > Number(product.min_stock) * 0.5 ? "Alta" : "Média";
                        const urgencyColor = urgency === "Crítico" ? "#dc2626" : urgency === "Alta" ? "#f97316" : "#eab308";
                        return (
                          <tr key={product.id}>
                            <td><strong>{product.name}</strong></td>
                            <td>{product.category_name || "-"}</td>
                            <td>{product.supplier_name || "-"}</td>
                            <td>
                              <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                {product.current_stock}
                              </span>
                            </td>
                            <td>{product.min_stock}</td>
                            <td>
                              <span style={{ color: '#2563eb', fontWeight: 'bold' }}>
                                {getRestockQuantity(product)}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 10px',
                                borderRadius: '12px',
                                backgroundColor: urgencyColor + '20',
                                color: urgencyColor,
                                fontWeight: 'bold',
                                fontSize: '12px'
                              }}>
                                {urgency}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn-action"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setMovement({
                                    type: "adjust",
                                    quantity: String(getRestockQuantity(product)),
                                    reason: "Reposição de estoque"
                                  });
                                  setShowMovementModal(true);
                                }}
                              >
                                Repor
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "categories" && (
          <div className="tab-content">
            <div className="search-section">
              <button className="button" onClick={() => {
                setSelectedCategory(null);
                setNewCategory({ name: "", description: "" });
                setShowCategoryModal(true);
              }}>Nova Categoria</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Descrição</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td><strong>{cat.name}</strong></td>
                      <td>{cat.description || "-"}</td>
                      <td style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className="btn-action" onClick={() => {
                          setSelectedCategory(cat);
                          setNewCategory({ name: cat.name, description: cat.description || "" });
                          setShowCategoryModal(true);
                        }}>Editar</button>
                        <button className="btn-action" style={{ background: '#dc2626' }} onClick={() => handleDeleteCategory(cat.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "suppliers" && (
          <div className="tab-content">
            <div className="search-section">
              <button className="button" onClick={() => {
                setSelectedSupplier(null);
                setNewSupplier({ name: "", contact: "", phone: "", email: "" });
                setShowSupplierModal(true);
              }}>Novo Fornecedor</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Contato</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(sup => (
                    <tr key={sup.id}>
                      <td><strong>{sup.name}</strong></td>
                      <td>{sup.contact || "-"}</td>
                      <td>{sup.phone || "-"}</td>
                      <td>{sup.email || "-"}</td>
                      <td style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className="btn-action" onClick={() => {
                          setSelectedSupplier(sup);
                          setNewSupplier({ name: sup.name, contact: sup.contact || "", phone: sup.phone || "", email: sup.email || "" });
                          setShowSupplierModal(true);
                        }}>Editar</button>
                        <button className="btn-action" style={{ background: '#dc2626' }} onClick={() => handleDeleteSupplier(sup.id)}>Excluir</button>
                      </td>
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

            <div className="form-group">
              <label>Tipo de Unidade *</label>
              <select value={newProduct.unit_type} onChange={(e) => setNewProduct({ ...newProduct, unit_type: e.target.value })}>
                <option value="un">Unidade (un)</option>
                <option value="kg">Quilograma (kg)</option>
                <option value="g">Grama (g)</option>
                <option value="l">Litro (l)</option>
                <option value="cx">Caixa (cx)</option>
                <option value="pct">Pacote (pct)</option>
              </select>
              {newProduct.unit_type === 'kg' && (
                <small style={{ color: '#2563eb', marginTop: '4px', display: 'block' }}>
                  ⚖️ Produto por peso — suporta leitura de balança no caixa
                </small>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Preço por {newProduct.unit_type === 'kg' ? 'kg' : 'unidade'} *</label>
                <input type="number" step="0.01" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Estoque Inicial * {newProduct.unit_type === 'kg' ? '(kg)' : ''}</label>
                <input type="number" step={newProduct.unit_type === 'kg' ? '0.001' : '1'} value={newProduct.current_stock} onChange={(e) => setNewProduct({ ...newProduct, current_stock: e.target.value })} placeholder={newProduct.unit_type === 'kg' ? 'Ex: 10.500' : 'Ex: 50'} />
              </div>
              <div className="form-group">
                <label>Estoque Mínimo * {newProduct.unit_type === 'kg' ? '(kg)' : ''}</label>
                <input type="number" step={newProduct.unit_type === 'kg' ? '0.001' : '1'} value={newProduct.min_stock} onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })} placeholder={newProduct.unit_type === 'kg' ? 'Ex: 2.000' : 'Ex: 10'} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreateProduct}>Criar Produto</button>
              <button className="btn-secondary" onClick={() => setShowNewProductModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Categoria (Nova/Editar) */}
      {showCategoryModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowCategoryModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{selectedCategory ? "Editar Categoria" : "Nova Categoria"}</h2>
            <form onSubmit={handleSaveCategory}>
              <div className="form-group">
                <label>Nome *</label>
                <input autoFocus type="text" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <textarea value={newCategory.description} onChange={e => setNewCategory({...newCategory, description: e.target.value})} rows={3} />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Salvar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>Voltar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Fornecedor (Novo/Editar) */}
      {showSupplierModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowSupplierModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{selectedSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</h2>
            <form onSubmit={handleSaveSupplier}>
              <div className="form-group">
                <label>Nome *</label>
                <input autoFocus type="text" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Contato</label>
                <input type="text" value={newSupplier.contact} onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input type="text" value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} />
              </div>
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
            <p className="modal-subtitle">
              <strong>{selectedProduct.name}</strong>
              {selectedProduct.unit_type === 'kg' && <span style={{ marginLeft: '8px', fontSize: '12px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '10px' }}>⚖️ Produto por kg</span>}
              {' '}— Estoque atual: <strong>{selectedProduct.unit_type === 'kg' ? `${Number(selectedProduct.current_stock).toFixed(3)} kg` : selectedProduct.current_stock}</strong>
            </p>
            <div className="form-group">
              <label>Tipo de Movimentação</label>
              <select value={movement.type} onChange={e => setMovement({...movement, type: e.target.value})}>
                <option value="adjust">Entrada (Adicionar ao estoque)</option>
                <option value="adjust_negative">Saída (Remover do estoque)</option>
                <option value="loss">Perda / Descarte</option>
              </select>
            </div>
            <div className="form-group">
              <label>Quantidade {selectedProduct.unit_type === 'kg' ? '(kg) *' : '*'}</label>
              <input
                type="number"
                min={selectedProduct.unit_type === 'kg' ? '0.001' : '1'}
                step={selectedProduct.unit_type === 'kg' ? '0.001' : '1'}
                value={movement.quantity}
                onChange={e => setMovement({...movement, quantity: e.target.value})}
                placeholder={selectedProduct.unit_type === 'kg' ? 'Ex: 5.500' : 'Ex: 10'}
              />
              {movement.type === "adjust" && movement.quantity && (
                <small style={{ color: '#16a34a' }}>
                  Novo estoque: {selectedProduct.unit_type === 'kg'
                    ? `${(Number(selectedProduct.current_stock) + Number(movement.quantity || 0)).toFixed(3)} kg`
                    : Number(selectedProduct.current_stock) + Number(movement.quantity || 0)}
                </small>
              )}
              {movement.type === "adjust_negative" && movement.quantity && (
                <small style={{ color: '#dc2626' }}>
                  Novo estoque: {selectedProduct.unit_type === 'kg'
                    ? `${(Number(selectedProduct.current_stock) - Number(movement.quantity || 0)).toFixed(3)} kg`
                    : Number(selectedProduct.current_stock) - Number(movement.quantity || 0)}
                </small>
              )}
              {movement.type === "loss" && movement.quantity && (
                <small style={{ color: '#f97316' }}>
                  Novo estoque após perda: {selectedProduct.unit_type === 'kg'
                    ? `${(Number(selectedProduct.current_stock) - Number(movement.quantity || 0)).toFixed(3)} kg`
                    : Number(selectedProduct.current_stock) - Number(movement.quantity || 0)}
                </small>
              )}
            </div>
            <div className="form-group">
              <label>Motivo *</label>
              <textarea
                value={movement.reason}
                onChange={e => setMovement({...movement, reason: e.target.value})}
                placeholder="Ex: Recebimento de mercadoria, produto vencido, ajuste de inventário..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => handleStockMovement()}>Registrar</button>
              <button className="btn-secondary" onClick={() => setShowMovementModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aprovação */}
      {showApprovalModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal">
            <h2>Aprovação Necessária</h2>
            <p>Esta operação requer aprovação de um supervisor ou gerente.</p>
            <form onSubmit={handleApprovalSubmit}>
              <div className="form-group">
                <label>Email do Aprovador</label>
                <input type="email" value={approvalData.email} onChange={e => setApprovalData({...approvalData, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Senha</label>
                <input type="password" value={approvalData.password} onChange={e => setApprovalData({...approvalData, password: e.target.value})} required />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Aprovar</button>
                <button type="button" className="btn-secondary" onClick={() => setShowApprovalModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
