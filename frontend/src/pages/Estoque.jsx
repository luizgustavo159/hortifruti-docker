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
    current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "", profit_margin: "30", image_url: ""
  });
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "", email: "" });
  const [movement, setMovement] = useState({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });
  const [selectedProducts, setSelectedProducts] = useState(new Set());

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

  // ==================== DICIONÁRIO CARICATO DE FRUTAS/VERDURAS ====================
  const emojiDictionary = {
    // Frutas vermelhas
    "maçã": "🍎", "maca": "🍎", "apple": "🍎",
    "morango": "🍓", "strawberry": "🍓",
    "cereja": "🍒", "cherry": "🍒",
    "melancia": "🍉", "watermelon": "🍉",
    "tomate": "🍅", "tomato": "🍅",
    
    // Frutas amarelas/laranjas
    "banana": "🍌",
    "laranja": "🍊", "orange": "🍊",
    "limão": "🍋", "lemon": "🍋",
    "abacaxi": "🍍", "pineapple": "🍍",
    "manga": "🥭", "mango": "🥭",
    "melão": "🍈", "melon": "🍈",
    "pêssego": "🍑", "peach": "🍑",
    "pera": "🍐", "pear": "🍐",
    
    // Frutas roxas/azuis
    "uva": "🍇", "grape": "🍇",
    "amora": "🫐", "blueberry": "🫐", "mirtilo": "🫐",
    "berinjela": "🍆", "eggplant": "🍆",
    
    // Verduras e Legumes
    "brócolis": "🥦", "brocolis": "🥦", "broccoli": "🥦",
    "cenoura": "🥕", "carrot": "🥕",
    "milho": "🌽", "corn": "🌽",
    "alface": "🥬", "lettuce": "🥬",
    "repolho": "🥬", "cabbage": "🥬",
    "espinafre": "🥬", "spinach": "🥬",
    "abóbora": "🎃", "pumpkin": "🎃", "squash": "🎃",
    "batata": "🥔", "potato": "🥔",
    "cebola": "🧅", "onion": "🧅",
    "alho": "🧄", "garlic": "🧄",
    "pimentão": "🫑", "pepper": "🫑", "bell_pepper": "🫑",
    "pimenta": "🌶️", "chili": "🌶️",
    "pepino": "🥒", "cucumber": "🥒",
    "abacate": "🥑", "avocado": "🥑",
    "cogumelo": "🍄", "mushroom": "🍄",
    "feijão": "🫘", "beans": "🫘",
    "batata doce": "🍠", "sweet potato": "🍠",
    
    // Frutas secas/sementes/outros
    "amendoim": "🥜", "peanut": "🥜",
    "coco": "🥥", "coconut": "🥥",
    "noz": "🌰", "walnut": "🌰", "nut": "🌰",
    "mel": "🍯", "honey": "🍯",
    "ovo": "🥚", "egg": "🥚",
  };

  // ==================== FUNÇÕES DE GERAÇÃO DE IMAGEM CARICATA ====================
  const generateCaricatureImage = (productName) => {
    if (!productName || productName.trim().length < 2) return "";
    const nameLower = productName.toLowerCase().trim();
    let emoji = "🥬";
    const sortedKeys = Object.keys(emojiDictionary).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (nameLower.includes(key)) {
        emoji = emojiDictionary[key];
        break;
      }
    }
    const svg = `
      <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="400" fill="#f0f8ff" rx="10"/>
        <circle cx="200" cy="150" r="100" fill="#ffffff" stroke="#e0e0e0" stroke-width="2"/>
        <text x="200" y="165" font-size="160" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
        <text x="200" y="300" font-size="32" font-weight="bold" text-anchor="middle" fill="#2c3e50" font-family="Arial">${productName.toUpperCase()}</text>
        <rect x="100" y="330" width="200" height="2" fill="#4CAF50"/>
      </svg>
    `;
    return new Promise((resolve) => {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400; canvas.height = 400;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = url;
    });
  };

  // ==================== FUNÇÕES DE CÁLCULO ====================
  const calculateSuggestedPrice = (cost, margin) => {
    if (!cost || parseFloat(cost) <= 0 || !margin || parseFloat(margin) < 0) return 0;
    const costNum = parseFloat(cost);
    const marginNum = parseFloat(margin);
    const suggested = costNum * (1 + marginNum / 100);
    return Math.round(suggested * 100) / 100;
  };

  const calculateCurrentMargin = (price, cost) => {
    if (!price || !cost || parseFloat(price) <= 0 || parseFloat(cost) <= 0) return 0;
    const priceNum = parseFloat(price);
    const costNum = parseFloat(cost);
    const margin = ((priceNum - costNum) / costNum) * 100;
    return Math.round(margin * 100) / 100;
  };

  // ==================== FUNÇÕES DE UPLOAD E COMPRESSÃO DE IMAGEM ====================
  const compressImage = (base64Str, maxWidth = 400, maxHeight = 400) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
        else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result;
      if (typeof base64 === 'string') {
        const compressed = await compressImage(base64);
        setNewProduct(prev => ({ ...prev, image_url: compressed }));
        setSuccessMessage("Imagem carregada!");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateCaricature = async () => {
    if (!newProduct.name || newProduct.name.trim().length < 2) {
      setError("Digite o nome do produto primeiro");
      return;
    }
    const imageUrl = await generateCaricatureImage(newProduct.name);
    setNewProduct(prev => ({ ...prev, image_url: imageUrl }));
    setSuccessMessage(`Imagem gerada para "${newProduct.name}"!`);
  };

  // ==================== FUNÇÕES DE CÓDIGO DE BARRAS ====================
  const generateEAN13 = () => {
    const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    let sum = 0;
    for (let i = 0; i < 12; i++) { sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3); }
    const checkDigit = (10 - (sum % 10)) % 10;
    return base + checkDigit;
  };

  const isValidEAN13 = (ean) => {
    if (!ean || !/^\d{13}$/.test(ean)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) { sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3); }
    const checkDigit = (10 - (sum % 10)) % 10;
    return parseInt(ean[12]) === checkDigit;
  };

  const handleSaveProduct = async () => {
    try {
      if (selectedProduct) { await apiFetch(`/products/${selectedProduct.id}`, { method: "PUT", body: JSON.stringify(newProduct) }); }
      else { await apiFetch("/products", { method: "POST", body: JSON.stringify(newProduct) }); }
      setShowNewProductModal(false); setSelectedProduct(null);
      setNewProduct({ name: "", sku: "", category_id: "", supplier_id: "", price: "", current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "", profit_margin: "30", image_url: "" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleStockMovement = async () => {
    try {
      const qty = parseFloat(movement.quantity);
      const delta = movement.type === "inbound" ? qty : -qty;
      await apiFetch("/stock/adjust", { method: "POST", body: JSON.stringify({ product_id: selectedProduct.id, delta, reason: movement.reason, unit_cost: movement.type === "inbound" ? movement.unit_cost : 0 }) });
      setSuccessMessage("Movimentação registrada!");
      setShowMovementModal(false); loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveCategory = async () => {
    try {
      const method = selectedCategory ? "PUT" : "POST";
      const url = selectedCategory ? `/categories/${selectedCategory.id}` : "/categories";
      await apiFetch(url, { method, body: JSON.stringify(newCategory) });
      setSuccessMessage("Categoria salva!"); setShowCategoryModal(false);
      setNewCategory({ name: "", description: "" }); setSelectedCategory(null); loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveSupplier = async () => {
    try {
      const method = selectedSupplier ? "PUT" : "POST";
      const url = selectedSupplier ? `/suppliers/${selectedSupplier.id}` : "/suppliers";
      await apiFetch(url, { method, body: JSON.stringify(newSupplier) });
      setSuccessMessage("Fornecedor salvo!"); setShowSupplierModal(false);
      setNewSupplier({ name: "", contact: "", phone: "", email: "" }); setSelectedSupplier(null); loadData();
    } catch (err) { setError(err.message); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Excluir categoria?")) return;
    try { await apiFetch(`/categories/${id}`, { method: "DELETE" }); loadData(); } catch (err) { setError(err.message); }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm("Excluir fornecedor?")) return;
    try { await apiFetch(`/suppliers/${id}`, { method: "DELETE" }); loadData(); } catch (err) { setError(err.message); }
  };

  return (
    <PageShell title="Consultoria de Estoque" subtitle="Gerencie seu hortifruti com inteligência">
      <div className="stock-container">
        <div className="card-grid">
          <div className="card"><h3>Itens Críticos</h3><strong className="value-large critical">{restockSuggestions.length}</strong></div>
          <div className="card"><h3>Valor em Estoque</h3><strong className="value-large">R$ {products.reduce((acc, p) => acc + (p.current_stock * (p.avg_cost || 0)), 0).toFixed(2)}</strong></div>
          <div className="card"><h3>Giro Médio</h3><strong className="value-large">Alta</strong></div>
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
            <div className="inventory-header">
              <input type="text" placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => setShowNewProductModal(true)}>+ Novo Produto</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Produto</th><th>Estoque</th><th>Custo</th><th>Preço</th><th>Margem</th><th>Ações</th></tr></thead>
                <tbody>
                  {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const price = Number(p.price || 0); const cost = Number(p.avg_cost || 0);
                    const margin = price > 0 && cost > 0 ? ((price - cost) / cost * 100) : 0;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #eee' }}>
                              <img src={p.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div><strong>{p.name}</strong><br/><small>{p.category_name}</small></div>
                          </div>
                        </td>
                        <td><span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status_ok"}>{p.current_stock} {p.unit_type}</span></td>
                        <td>R$ {cost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td><span className={margin < 30 ? "text-danger" : "text-success"}>{margin.toFixed(1)}%</span></td>
                        <td>
                          <button className="btn-action" onClick={() => { setSelectedProduct(p); setNewProduct({name: p.name, sku: p.sku, category_id: p.category_id?.toString() || "", supplier_id: p.supplier_id?.toString() || "", price: p.price?.toString() || "", current_stock: p.current_stock?.toString() || "0", min_stock: p.min_stock?.toString() || "0", unit_type: p.unit_type, avg_cost: p.avg_cost?.toString() || "", profit_margin: p.product_profit_margin?.toString() || "30", image_url: p.image_url || ""}); setShowNewProductModal(true); }}>Editar</button>
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

        {/* Categorias e Fornecedores simplificados */}
        {activeTab === "categories" && (
          <div className="tab-content">
            <div className="inventory-header"><button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name: "", description: ""}); setShowCategoryModal(true); }}>+ Nova Categoria</button></div>
            <table className="table">
              <thead><tr><th>Nome</th><th>Descrição</th><th>Ações</th></tr></thead>
              <tbody>{categories.map(c => (<tr key={c.id}><td>{c.name}</td><td>{c.description}</td><td><button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name: c.name, description: c.description}); setShowCategoryModal(true); }}>Editar</button></td></tr>))}</tbody>
            </table>
          </div>
        )}

        {activeTab === "suppliers" && (
          <div className="tab-content">
            <div className="inventory-header"><button className="btn-primary" onClick={() => { setSelectedSupplier(null); setNewSupplier({name: "", contact: "", phone: "", email: ""}); setShowSupplierModal(true); }}>+ Novo Fornecedor</button></div>
            <table className="table">
              <thead><tr><th>Nome</th><th>Contato</th><th>Ações</th></tr></thead>
              <tbody>{suppliers.map(s => (<tr key={s.id}><td>{s.name}</td><td>{s.contact}</td><td><button className="btn-action" onClick={() => { setSelectedSupplier(s); setNewSupplier({name: s.name, contact: s.contact, phone: s.phone, email: s.email}); setShowSupplierModal(true); }}>Editar</button></td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Produto - LAYOUT COM BOTÕES AO LADO DA IMAGEM */}
      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '650px' }}>
            <h2>📦 {selectedProduct ? "Editar Produto" : "Novo Produto"}</h2>
            
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              
              {/* ÁREA DE IMAGEM E BOTÕES LADO A LADO */}
              <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #eee' }}>
                <div style={{ width: '120px', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #ddd', backgroundColor: 'white', flexShrink: 0 }}>
                  {newProduct.image_url ? (
                    <img src={newProduct.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', fontSize: '12px' }}>Sem Foto</div>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  <button type="button" onClick={handleGenerateCaricature} style={{ padding: '10px 15px', background: '#4CAF50', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}>
                    🎨 Gerar Imagem Caricata
                  </button>
                  <label style={{ padding: '10px 15px', background: '#2196F3', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}>
                    📁 Carregar Foto do PC
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  <small style={{ color: '#666', fontSize: '11px' }}>Dica: Digite o nome do produto para gerar uma caricatura automática.</small>
                </div>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Nome do Produto</label>
                <input placeholder="Ex: Maçã Gala" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="input" />
              </div>
              
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Código de Barras (EAN-13)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input placeholder="Código EAN-13" value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} className="input" style={{ flex: 1 }} />
                  <button type="button" onClick={handleGenerateBarcode} style={{ padding: '0 15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📱 Gerar</button>
                </div>
              </div>

              <div className="form-group">
                <label>Unidade</label>
                <select value={newProduct.unit_type} onChange={e => setNewProduct({...newProduct, unit_type: e.target.value})} className="input">
                  <option value="un">Unidade</option><option value="kg">Quilo</option><option value="cx">Caixa</option>
                </select>
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input">
                  <option value="">Selecione...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Custo (R$)</label>
                <input type="number" step="0.01" value={newProduct.avg_cost} onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Margem (%)</label>
                <input type="number" value={newProduct.profit_margin} onChange={e => setNewProduct({...newProduct, profit_margin: e.target.value})} className="input" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Preço de Venda (R$)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" style={{ flex: 1 }} />
                  <div style={{ padding: '8px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #4CAF50', fontSize: '12px' }}>
                    Sugestão: <strong>R$ {calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toFixed(2)}</strong>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Estoque</label>
                <input type="number" value={newProduct.current_stock} onChange={e => setNewProduct({...newProduct, current_stock: e.target.value})} className="input" />
              </div>
              <div className="form-group">
                <label>Mínimo</label>
                <input type="number" value={newProduct.min_stock} onChange={e => setNewProduct({...newProduct, min_stock: e.target.value})} className="input" />
              </div>
            </div>
            
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={handleSaveProduct} className="btn-primary" style={{ flex: 1 }}>Salvar Produto</button>
              <button onClick={() => setShowNewProductModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Outros modais */}
      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Movimentação: {selectedProduct.name}</h2>
            <input type="number" placeholder="Quantidade" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" />
            <div className="modal-actions" style={{ marginTop: '15px' }}>
              <button onClick={handleStockMovement} className="btn-primary">Confirmar</button>
              <button onClick={() => setShowMovementModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Categoria</h2>
            <input placeholder="Nome" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} className="input" style={{ marginBottom: '10px' }} />
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
