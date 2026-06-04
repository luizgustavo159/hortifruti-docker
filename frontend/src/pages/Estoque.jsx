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
    name: "", sku: "", category_id: "", supplier_id: "", price: "", 
    current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "", profit_margin: "30"
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

  // ==================== FUNÇÕES DE CÁLCULO ====================
  // Calcula preço sugerido baseado em MARGEM SOBRE CUSTO (ex: custo 10 + 30% = 13)
  const calculateSuggestedPrice = (cost, margin) => {
    if (!cost || parseFloat(cost) <= 0 || !margin || parseFloat(margin) < 0) return 0;
    const costNum = parseFloat(cost);
    const marginNum = parseFloat(margin);
    // Fórmula: Preço = Custo * (1 + Margem%/100)
    const suggested = costNum * (1 + marginNum / 100);
    return Math.round(suggested * 100) / 100;
  };

  // Calcula margem atual baseado em MARGEM SOBRE CUSTO
  const calculateCurrentMargin = (price, cost) => {
    if (!price || !cost || parseFloat(price) <= 0 || parseFloat(cost) <= 0) return 0;
    const priceNum = parseFloat(price);
    const costNum = parseFloat(cost);
    // Fórmula: Margem% = ((Preço - Custo) / Custo) * 100
    const margin = ((priceNum - costNum) / costNum) * 100;
    return Math.round(margin * 100) / 100;
  };

  const getSelectedCategoryMargin = () => {
    if (!newProduct.category_id) return 30;
    const category = categories.find(c => c.id === parseInt(newProduct.category_id));
    return category?.target_margin || 30;
  };

  // Lógica de Geração de Insights (Consultoria)
  const generateInsights = () => {
    const insights = [];
    
    products.forEach(p => {
      const price = Number(p.price || 0);
      const cost = Number(p.avg_cost || 0);
      const margin = price > 0 ? ((price - cost) / price * 100) : 0;
      const target = p.category_margin || 30;

      // Alerta de Margem Baixa
      if (margin < target && price > 0) {
        insights.push({
          type: "warning",
          title: `Margem Baixa: ${p.name}`,
          text: `A margem atual é de ${margin.toFixed(1)}%, mas o alvo para ${p.category_name} é ${target}%. Considere reajustar o preço.`,
          action: () => handleQuickPriceUpdate(p)
        });
      }

      // Alerta de Dinheiro Parado (Estoque muito alto - ex: 5x o mínimo)
      if (Number(p.current_stock) > Number(p.min_stock) * 5 && Number(p.current_stock) > 0) {
        insights.push({
          type: "info",
          title: `Estoque Elevado: ${p.name}`,
          text: `Você tem ${p.current_stock} ${p.unit_type} em estoque. Isso representa R$ ${(Number(p.current_stock) * cost).toFixed(2)} imobilizados. Talvez uma promoção?`,
        });
      }
    });

    // Alerta de Reposição Crítica
    if (restockSuggestions.length > 0) {
      insights.push({
        type: "danger",
        title: "Atenção ao Suprimento",
        text: `Existem ${restockSuggestions.length} itens abaixo do estoque mínimo que podem faltar em breve.`,
        tab: "restock"
      });
    }

    return insights;
  };

  const insights = generateInsights();

  const handleSaveProduct = async () => {
    try {
      if (selectedProduct) {
        // Edição de produto existente
        await apiFetch(`/products/${selectedProduct.id}`, { method: "PUT", body: JSON.stringify(newProduct) });
        setSuccessMessage("Produto atualizado!");
      } else {
        // Criação de novo produto
        await apiFetch("/products", { method: "POST", body: JSON.stringify(newProduct) });
        setSuccessMessage("Produto cadastrado!");
      }
      setShowNewProductModal(false);
      setSelectedProduct(null);
      setNewProduct({ name: "", sku: "", category_id: "", supplier_id: "", price: "", current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "", profit_margin: "30" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleQuickPriceUpdate = async (product) => {
    const targetMargin = product.category_margin || 30;
    const avgCost = Number(product.avg_cost || 0);
    const suggestedPrice = avgCost / (1 - (targetMargin / 100));
    
    if (window.confirm(`Deseja atualizar o preço de ${product.name} para R$ ${suggestedPrice.toFixed(2)} para atingir a margem de ${targetMargin}%?`)) {
      try {
        await apiFetch(`/products/${product.id}/price`, {
          method: "PUT",
          body: JSON.stringify({ price: suggestedPrice.toFixed(2) })
        });
        setSuccessMessage("Preço atualizado com sucesso!");
        loadData();
      } catch (err) { setError(err.message); }
    }
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
      setSuccessMessage("Movimentação registrada!");
      setShowMovementModal(false);
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
      setNewCategory({ name: "", description: "", margin_target: "30" });
      setSelectedCategory(null);
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
      setNewSupplier({ name: "", contact: "", phone: "", email: "" });
      setSelectedSupplier(null);
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Deseja realmente excluir esta categoria?")) return;
    try {
      await apiFetch(`/categories/${id}`, { method: "DELETE" });
      setSuccessMessage("Categoria excluída!");
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm("Deseja realmente excluir este fornecedor?")) return;
    try {
      await apiFetch(`/suppliers/${id}`, { method: "DELETE" });
      setSuccessMessage("Fornecedor excluído!");
      loadData();
    } catch (err) { setError(err.message); }
  };

  return (
    <PageShell title="Consultoria de Estoque" subtitle="Insights para sua Tomada de Decisão">
      <div className="stock-container">
        
        {/* NOVO: Painel de Dicas de Atenção (Insights) */}
        {insights.length > 0 && (
          <div className="insights-panel">
            <h3 className="insights-title">💡 Dicas de Atenção</h3>
            <div className="insights-list">
              {insights.slice(0, 3).map((insight, idx) => (
                <div key={idx} className={`insight-card ${insight.type}`}>
                  <div className="insight-content">
                    <strong>{insight.title}</strong>
                    <p>{insight.text}</p>
                  </div>
                  {insight.action && (
                    <button className="btn-insight-action" onClick={insight.action}>Resolver</button>
                  )}
                  {insight.tab && (
                    <button className="btn-insight-action" onClick={() => setActiveTab(insight.tab)}>Ver Itens</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-grid">
          <div className="card"><h3>Itens Críticos</h3><strong className="value-large critical">{restockSuggestions.length}</strong></div>
          <div className="card"><h3>Valor em Estoque</h3><strong className="value-large">R$ {products.reduce((acc, p) => acc + (p.current_stock * (p.avg_cost || 0)), 0).toFixed(2)}</strong></div>
          <div className="card"><h3>Giro Médio</h3><strong className="value-large">Alta</strong></div>
        </div>

        {successMessage && <div className="success-message">{successMessage}</div>}
        {error && <div className="error-message">{error}</div>}

        <div className="tabs">
          <button className={`tab ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>Inventário</button>
          <button className={`tab ${activeTab === "restock" ? "active" : ""}`} onClick={() => setActiveTab("restock")}>Reposições</button>
          <button className={`tab ${activeTab === "categories" ? "active" : ""}`} onClick={() => setActiveTab("categories")}>Categorias</button>
          <button className={`tab ${activeTab === "suppliers" ? "active" : ""}`} onClick={() => setActiveTab("suppliers")}>Fornecedores</button>
        </div>

        {activeTab === "inventory" && (
          <div className="tab-content">
            <div className="inventory-header">
              <input type="text" placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Produto</th><th>Estoque</th><th>Custo Médio</th><th>Preço</th><th>Margem</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const price = Number(p.price || 0);
                    const cost = Number(p.avg_cost || 0);
                    const margin = price > 0 ? ((price - cost) / price * 100) : 0;
                    const isLow = margin < (p.category_margin || 30);
                    return (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong><br/><small>{p.category_name}</small></td>
                        <td><span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status ok"}>{p.current_stock} {p.unit_type}</span></td>
                        <td>R$ {cost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td><span className={isLow ? "text-danger" : "text-success"}>{margin.toFixed(1)}%</span></td>
                        <td>
                          <button className="btn-action" onClick={() => { setSelectedProduct(p); setNewProduct({name: p.name, sku: p.sku, category_id: p.category_id?.toString() || "", supplier_id: p.supplier_id?.toString() || "", price: p.price?.toString() || "", current_stock: p.current_stock?.toString() || "0", min_stock: p.min_stock?.toString() || "0", unit_type: p.unit_type, avg_cost: p.avg_cost?.toString() || "", profit_margin: p.product_profit_margin?.toString() || "30"}); setShowNewProductModal(true); }}>Editar</button>
                          <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({type: "inbound", quantity: "", reason: "Compra", unit_cost: ""}); setShowMovementModal(true); }}>Entrada</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "categories" && (
          <div className="tab-content">
            <div className="inventory-header">
              <input type="text" placeholder="Buscar categoria..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name: "", description: "", margin_target: "30"}); setShowCategoryModal(true); }}>+ Nova Categoria</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Nome</th><th>Descrição</th><th>Margem Alvo</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.description}</td>
                      <td>{c.target_margin}%</td>
                      <td>
                        <button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name: c.name, description: c.description, margin_target: c.target_margin}); setShowCategoryModal(true); }}>Editar</button>
                        <button className="btn-action danger" onClick={() => handleDeleteCategory(c.id)}>Excluir</button>
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
            <div className="inventory-header">
              <input type="text" placeholder="Buscar fornecedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => { setSelectedSupplier(null); setNewSupplier({name: "", contact: "", phone: "", email: ""}); setShowSupplierModal(true); }}>+ Novo Fornecedor</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Nome</th><th>Contato</th><th>Telefone</th><th>Email</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {suppliers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.contact}</td>
                      <td>{s.phone}</td>
                      <td>{s.email}</td>
                      <td>
                        <button className="btn-action" onClick={() => { setSelectedSupplier(s); setNewSupplier({name: s.name, contact: s.contact, phone: s.phone, email: s.email}); setShowSupplierModal(true); }}>Editar</button>
                        <button className="btn-action danger" onClick={() => handleDeleteSupplier(s.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modais mantidos conforme versão anterior */}
      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <h2>📦 {selectedProduct ? "Editar Produto" : "Novo Produto"}</h2>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Nome do Produto</label>
                <input placeholder="Ex: Maçã Gala" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Código SKU / Barras</label>
                <input placeholder="Ex: 789..." value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Tipo de Unidade</label>
                <select value={newProduct.unit_type} onChange={e => setNewProduct({...newProduct, unit_type: e.target.value})} className="input">
                  <option value="un">Unidade (un)</option>
                  <option value="kg">Quilo (kg)</option>
                  <option value="g">Grama (g)</option>
                  <option value="cx">Caixa (cx)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select value={newProduct.category_id} onChange={e => {
                  const categoryId = e.target.value;
                  const category = categories.find(c => c.id === parseInt(categoryId));
                  setNewProduct({
                    ...newProduct, 
                    category_id: categoryId,
                    profit_margin: category?.target_margin?.toString() || "30"
                  });
                }} className="input">
                    <option value="">Selecione...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fornecedor</label>
                <select value={newProduct.supplier_id} onChange={e => setNewProduct({...newProduct, supplier_id: e.target.value})} className="input">
                    <option value="">Selecione...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Custo Médio (R$)</label>
                <input placeholder="0.00" type="number" step="0.01" value={newProduct.avg_cost} onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Margem de Lucro (%)</label>
                <input placeholder="30" type="number" step="0.1" value={newProduct.profit_margin} onChange={e => setNewProduct({...newProduct, profit_margin: e.target.value})} className="input" />
                <small>Padrão da categoria: {getSelectedCategoryMargin()}%</small>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Preço Sugerido (Calculado)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #4CAF50' }}>
                  <strong style={{ fontSize: '18px', color: '#4CAF50' }}>R$ {calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toFixed(2)}</strong>
                  <button type="button" onClick={() => setNewProduct({...newProduct, price: calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toString()})} style={{ padding: '6px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✓ Usar</button>
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Preço de Venda (R$)</label>
                <input placeholder="0.00" type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" />
                <small style={{ color: calculateCurrentMargin(newProduct.price, newProduct.avg_cost) >= parseFloat(newProduct.profit_margin || 30) ? '#4CAF50' : '#f44336' }}>Margem atual: {calculateCurrentMargin(newProduct.price, newProduct.avg_cost).toFixed(1)}% {calculateCurrentMargin(newProduct.price, newProduct.avg_cost) >= parseFloat(newProduct.profit_margin || 30) ? '✓' : '⚠'}</small>
              </div>
              <div className="form-group">
                <label>Estoque Atual</label>
                <input placeholder="0" type="number" value={newProduct.current_stock} onChange={e => setNewProduct({...newProduct, current_stock: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Estoque Mínimo</label>
                <input placeholder="0" type="number" value={newProduct.min_stock} onChange={e => setNewProduct({...newProduct, min_stock: e.target.value})} className="input" />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <button onClick={handleSaveProduct} className="btn-primary" style={{ flex: 1 }}>Cadastrar Produto</button>
                <button onClick={() => setShowNewProductModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Movimentação: {selectedProduct.name}</h2>
            <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <small><strong>Estoque Atual:</strong> {selectedProduct.current_stock} {selectedProduct.unit_type}</small><br/>
              <small><strong>Custo Médio:</strong> R$ {Number(selectedProduct.avg_cost || 0).toFixed(2)}</small><br/>
              <small><strong>Preço Venda:</strong> R$ {Number(selectedProduct.price || 0).toFixed(2)}</small>
            </div>
            <input type="number" placeholder="Quantidade" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" />
            {movement.type === 'inbound' && (
              <>
                <input type="number" placeholder="Custo Unitário R$" step="0.01" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} className="input" />
                {movement.unit_cost && parseFloat(movement.unit_cost) > 0 && (
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #4CAF50' }}>
                    <small><strong>Novo Custo Médio Estimado:</strong></small><br/>
                    {(() => {
                      const currentStock = Number(selectedProduct.current_stock || 0);
                      const newQty = Number(movement.quantity || 0);
                      const currentCost = Number(selectedProduct.avg_cost || 0);
                      const newCost = Number(movement.unit_cost || 0);
                      if (newQty > 0 && newCost > 0) {
                        const newAvgCost = (currentStock * currentCost + newQty * newCost) / (currentStock + newQty);
                        const targetMargin = selectedProduct.product_profit_margin || selectedProduct.category_margin || 30;
                        const suggestedPrice = newAvgCost * (1 + targetMargin / 100);
                        return (
                          <>
                            <small>R$ {newAvgCost.toFixed(2)}</small><br/>
                            <small style={{ color: '#4CAF50', marginTop: '6px', display: 'block' }}><strong>💰 Preço Sugerido:</strong> R$ {suggestedPrice.toFixed(2)}</small>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </>
            )}
            <div className="modal-actions">
                <button onClick={handleStockMovement} className="btn-primary">Confirmar</button>
                <button onClick={() => setShowMovementModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedCategory ? "Editar Categoria" : "Nova Categoria"}</h2>
            <div className="form-group">
              <label>Nome</label>
              <input value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input value={newCategory.description} onChange={e => setNewCategory({...newCategory, description: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Margem Alvo (%)</label>
              <input type="number" value={newCategory.margin_target} onChange={e => setNewCategory({...newCategory, margin_target: e.target.value})} className="input" />
            </div>
            <div className="modal-actions">
              <button onClick={handleSaveCategory} className="btn-primary">Salvar</button>
              <button onClick={() => setShowCategoryModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showSupplierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</h2>
            <div className="form-group">
              <label>Nome da Empresa</label>
              <input value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Nome do Contato</label>
              <input value={newSupplier.contact} onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Telefone</label>
              <input value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} className="input" />
            </div>
            <div className="modal-actions">
              <button onClick={handleSaveSupplier} className="btn-primary">Salvar</button>
              <button onClick={() => setShowSupplierModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
