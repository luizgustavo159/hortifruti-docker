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

  // ==================== MOTOR DE BUSCA SEMÂNTICA REFINADO ====================
  const getEmojiForProduct = (name) => {
    if (!name) return "📦";
    
    // Normalizar texto: minúsculas e remover acentos para busca
    const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const text = normalize(name);

    const library = {
      "maca|apple": "🍎", "banana": "🍌", "uva|grape": "🍇", "morango|strawberry": "🍓", 
      "cereja|cherry": "🍒", "melancia|watermelon": "🍉", "tomate|tomato": "🍅", 
      "laranja|orange": "🍊", "limao|lemon": "🍋", "abacaxi|pineapple": "🍍",
      "manga|mango": "🥭", "pessego|peach": "🍑", "pera|pear": "🍐", "melao|melon": "🍈", 
      "amora|blueberry|mirtilo": "🫐", "coco|coconut": "🥥", "abacate|avocado": "🥑",
      "kiwi": "🥝", "papaya|mamao": "🥭", "graviola|jaca|fruta": "🌳",
      "cenoura|carrot": "🥕", "milho|corn": "🌽", "brocolis": "🥦",
      "batata|potato": "🥔", "cebola|onion": "🧅", "alho|garlic": "🧄", "alface|repolho|folha|verde": "🥬",
      "pimentao|pepper": "🫑", "pimenta|chili": "🌶️", "berinjela|eggplant": "🍆", "pepino|cucumber": "🥒",
      "abobora|pumpkin": "🎃", "cogumelo|mushroom": "🍄", "feijao|bean": "🫘", "batata doce": "🍠",
      "ovo|egg": "🥚", "mel|honey": "🍯", "leite|milk": "🥛", "pao|bread": "🍞", "queijo|cheese": "🧀",
      "carne|frango|steak": "🥩", "peixe|fish": "🐟", "camarao|shrimp": "🍤",
      "doce|pudim|sobremesa|bolo": "🍮", "suco|bebida|refrigerante": "🥤", "agua|water": "💧",
      "cafe|coffee": "☕", "cha|tea": "🍵", "cerveja|beer": "🍺", "vinho|wine": "🍷",
      "arroz|grao": "🌾", "macarrao|massa": "🍝", "pizza": "🍕", "hamburguer": "🍔",
    };

    for (const [key, emoji] of Object.entries(library)) {
      const regex = new RegExp(key, "i");
      if (regex.test(text)) return emoji;
    }

    if (text.includes("suco") || text.includes("vitamina")) return "🥤";
    if (text.includes("doce") || text.includes("sobremesa")) return "🍰";
    if (text.includes("verde") || text.includes("organico")) return "🌿";
    return "📦";
  };

  const generateCaricatureImage = (productName) => {
    if (!productName || productName.trim().length < 2) return "";
    const emoji = getEmojiForProduct(productName);
    const svg = `
      <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
        <text x="200" y="220" font-size="280" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
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

  const calculateSuggestedPrice = (cost, margin) => {
    const costNum = parseFloat(cost) || 0;
    const marginNum = parseFloat(margin) || 0;
    if (costNum <= 0) return 0;
    return Math.round(costNum * (1 + marginNum / 100) * 100) / 100;
  };

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
    setSuccessMessage(`Imagem gerada!`);
  };

  const generateEAN13 = () => {
    const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    let sum = 0;
    for (let i = 0; i < 12; i++) { sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3); }
    const checkDigit = (10 - (sum % 10)) % 10;
    return base + checkDigit;
  };

  const normalizeProductName = (name) => {
    if (!name) return "";
    
    // Dicionário de termos básicos para acentuação correta
    const accents = {
      "maca": "MAÇÃ", "limao": "LIMÃO", "mamao": "MAMÃO", "pera": "PÊRA", "pessego": "PÊSSEGO",
      "maracuja": "MARACUJÁ", "abobora": "ABÓBORA", "pimentao": "PIMENTÃO", "jilo": "JILÓ",
      "agriao": "AGRIÃO", "rucula": "RÚCULA", "brocolis": "BRÓCOLIS", "manjericao": "MANJERICÃO",
      "melao": "MELÃO", "acai": "AÇAÍ", "carvo": "CARVÃO", "pao": "PÃO", "grao": "GRÃO"
    };

    const words = name.toLowerCase().trim().split(/\s+/);
    const normalizedWords = words.map(word => accents[word] || word.toUpperCase());
    
    return normalizedWords.join(" ");
  };

  const handleSaveProduct = async () => {
    try {
      const productToSave = { ...newProduct, name: normalizeProductName(newProduct.name) };
      if (selectedProduct) { await apiFetch(`/products/${selectedProduct.id}`, { method: "PUT", body: JSON.stringify(productToSave) }); }
      else { await apiFetch("/products", { method: "POST", body: JSON.stringify(productToSave) }); }
      setShowNewProductModal(false); setSelectedProduct(null);
      setNewProduct({ name: "", sku: "", category_id: "", supplier_id: "", price: "", current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "0", profit_margin: "30", image_url: "" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveMovement = async () => {
    try {
      if (!selectedProduct) return;
      const endpoint = movement.type === "loss" ? "/stock/loss" : "/stock/adjust";
      const payload = movement.type === "loss" 
        ? { product_id: selectedProduct.id, quantity: Number(movement.quantity), reason: movement.reason }
        : { product_id: selectedProduct.id, delta: movement.type === "inbound" ? Number(movement.quantity) : -Number(movement.quantity), reason: movement.reason, unit_cost: Number(movement.unit_cost) };
      
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setShowMovementModal(false);
      setMovement({ type: "inbound", quantity: "", reason: "Compra", unit_cost: "" });
      loadData();
      setSuccessMessage("Movimentação realizada com sucesso!");
    } catch (err) { setError(err.message); }
  };

  const handleSaveCategory = async () => {
    try {
      if (selectedCategory) { await apiFetch(`/categories/${selectedCategory.id}`, { method: "PUT", body: JSON.stringify(newCategory) }); }
      else { await apiFetch("/categories", { method: "POST", body: JSON.stringify(newCategory) }); }
      setShowCategoryModal(false); setSelectedCategory(null);
      setNewCategory({ name: "", description: "" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleSaveSupplier = async () => {
    try {
      if (selectedSupplier) { await apiFetch(`/suppliers/${selectedSupplier.id}`, { method: "PUT", body: JSON.stringify(newSupplier) }); }
      else { await apiFetch("/suppliers", { method: "POST", body: JSON.stringify(newSupplier) }); }
      setShowSupplierModal(false); setSelectedSupplier(null);
      setNewSupplier({ name: "", contact: "", phone: "", email: "" });
      loadData();
    } catch (err) { setError(err.message); }
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
                            <div className="product-img-container">
                              <img src={p.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`} alt={p.name} />
                            </div>
                            <div><strong>{p.name}</strong><br/><small>{p.category_name}</small></div>
                          </div>
                        </td>
                        <td><span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status_ok"}>{p.current_stock} {p.unit_type}</span></td>
                        <td>R$ {cost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td><span className={margin < 30 ? "text-danger" : "text-success"}>{margin.toFixed(1)}%</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '5px' }}>
  <button className="btn-action" onClick={() => { setSelectedProduct(p); setMovement({ type: "inbound", quantity: "", reason: "Ajuste de Estoque", unit_cost: p.avg_cost || "" }); setShowMovementModal(true); }}>Estoque</button>
  <button className="btn-action" style={{ backgroundColor: '#9e9e9e' }} onClick={() => { setSelectedProduct(p); setNewProduct({name: p.name, sku: p.sku, category_id: p.category_id?.toString() || "", supplier_id: p.supplier_id?.toString() || "", price: p.price?.toString() || "", current_stock: p.current_stock?.toString() || "0", min_stock: p.min_stock?.toString() || "0", unit_type: p.unit_type, avg_cost: p.avg_cost?.toString() || "", profit_margin: p.product_profit_margin?.toString() || "30", image_url: p.image_url || ""}); setShowNewProductModal(true); }}>Editar</button>
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

        {activeTab === "categories" && (
          <div className="tab-content">
            <div className="inventory-header"><button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name: "", description: ""}); setShowCategoryModal(true); }}>+ Nova Categoria</button></div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Nome</th><th>Descrição</th><th>Ações</th></tr></thead>
                <tbody>{categories.map(c => (<tr key={c.id}><td>{c.name}</td><td>{c.description}</td><td><button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name: c.name, description: c.description}); setShowCategoryModal(true); }}>Editar</button></td></tr>))}</tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "suppliers" && (
          <div className="tab-content">
            <div className="inventory-header"><button className="btn-primary" onClick={() => { setSelectedSupplier(null); setNewSupplier({name: "", contact: "", phone: "", email: ""}); setShowSupplierModal(true); }}>+ Novo Fornecedor</button></div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Nome</th><th>Contato</th><th>Telefone</th><th>Email</th><th>Ações</th></tr></thead>
                <tbody>{suppliers.map(s => (<tr key={s.id}><td>{s.name}</td><td>{s.contact}</td><td>{s.phone}</td><td>{s.email}</td><td><button className="btn-action" onClick={() => { setSelectedSupplier(s); setNewSupplier({name: s.name, contact: s.contact, phone: s.phone, email: s.email}); setShowSupplierModal(true); }}>Editar</button></td></tr>))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '650px' }}>
            <h2>📦 {selectedProduct ? "Editar Produto" : "Novo Produto"}</h2>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
                <div style={{ width: '130px', height: '130px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ddd', backgroundColor: 'white', flexShrink: 0 }}>
                  {newProduct.image_url ? (<img src={newProduct.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', fontSize: '12px' }}>Sem Foto</div>)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '160px' }}>
                  <button type="button" onClick={handleGenerateCaricature} style={{ height: '38px', background: '#2196F3', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>🎨 Gerar</button>
                  <label style={{ height: '38px', background: '#2196F3', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📁 Upload<input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} /></label>
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
  <label>Nome do Produto</label>
  <input 
    placeholder="Ex: Maçã Gala" 
    value={newProduct.name} 
    onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
    onBlur={e => setNewProduct({...newProduct, name: normalizeProductName(e.target.value)})}
    className="input" 
  />
</div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Código de Barras</label><div style={{ display: 'flex', gap: '8px' }}><input value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} className="input" style={{ flex: 1 }} /><button type="button" onClick={() => setNewProduct({...newProduct, sku: generateEAN13()})} style={{ height: '38px', padding: '0 15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📱 Gerar</button></div></div>
              <div className="form-group"><label>Unidade</label><select value={newProduct.unit_type} onChange={e => setNewProduct({...newProduct, unit_type: e.target.value})} className="input"><option value="un">Unidade (un)</option><option value="kg">Quilo (kg)</option><option value="cx">Caixa (cx)</option></select></div>
              <div className="form-group"><label>Categoria</label><select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input"><option value="">Selecione...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="form-group"><label>Custo (R$)</label><input type="number" step="0.01" value={newProduct.avg_cost} onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} className="input" /></div>
              <div className="form-group"><label>Margem (%)</label><input type="number" value={newProduct.profit_margin} onChange={e => setNewProduct({...newProduct, profit_margin: e.target.value})} className="input" /></div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Preço de Venda (R$)</label><div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="input" style={{ flex: 1 }} /><div style={{ padding: '8px 12px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #4CAF50', fontSize: '13px', color: '#2e7d32', fontWeight: 'bold', textAlign: 'center', minWidth: '110px' }}><div style={{ fontSize: '9px', textTransform: 'uppercase', opacity: 0.7 }}>Sugerido</div>R$ {calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toFixed(2)}</div></div></div>
              <div className="form-group"><label>Estoque</label><input type="number" value={newProduct.current_stock} onChange={e => setNewProduct({...newProduct, current_stock: e.target.value})} className="input" /></div>
              <div className="form-group"><label>Mínimo</label><input type="number" value={newProduct.min_stock} onChange={e => setNewProduct({...newProduct, min_stock: e.target.value})} className="input" /></div>
            </div>
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}><button onClick={handleSaveProduct} className="btn-primary" style={{ flex: 1 }}>Salvar Produto</button><button onClick={() => setShowNewProductModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button></div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedCategory ? "Editar Categoria" : "Nova Categoria"}</h2>
            <div className="form-group"><label>Nome</label><input value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} className="input" /></div>
            <div className="form-group"><label>Descrição</label><input value={newCategory.description} onChange={e => setNewCategory({...newCategory, description: e.target.value})} className="input" /></div>
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}><button onClick={handleSaveCategory} className="btn-primary" style={{ flex: 1 }}>Salvar</button><button onClick={() => setShowCategoryModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button></div>
          </div>
        </div>
      )}

      {showSupplierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}</h2>
            <div className="form-group"><label>Nome</label><input value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} className="input" /></div>
            <div className="form-group"><label>Contato</label><input value={newSupplier.contact} onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} className="input" /></div>
            <div className="form-group"><label>Telefone</label><input value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} className="input" /></div>
            <div className="form-group"><label>Email</label><input value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} className="input" /></div>
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}><button onClick={handleSaveSupplier} className="btn-primary" style={{ flex: 1 }}>Salvar</button><button onClick={() => setShowSupplierModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button></div>
          </div>
        </div>
      )}

      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '450px' }}>
            <h2>🔄 Movimentação: {selectedProduct?.name}</h2>
            <div className="form-group">
              <label>Tipo de Operação</label>
              <select value={movement.type} onChange={e => setMovement({...movement, type: e.target.value, reason: e.target.value === 'loss' ? 'Quebra/Avaria' : 'Compra'})} className="input">
                <option value="inbound">Entrada (Compra/Ajuste +)</option>
                <option value="outbound">Saída (Ajuste -)</option>
                <option value="loss">Perda (Quebra/Vencimento)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Quantidade ({selectedProduct?.unit_type})</label>
              <input type="number" value={movement.quantity} onChange={e => setMovement({...movement, quantity: e.target.value})} className="input" placeholder="0.00" />
            </div>
            {movement.type === "inbound" && (
              <div className="form-group">
                <label>Custo Unitário (R$)</label>
                <input type="number" step="0.01" value={movement.unit_cost} onChange={e => setMovement({...movement, unit_cost: e.target.value})} className="input" placeholder="0.00" />
              </div>
            )}
            <div className="form-group">
              <label>Descrição / Motivo</label>
              <input 
                value={movement.reason} 
                onChange={e => setMovement({...movement, reason: e.target.value})} 
                onBlur={e => setMovement({...movement, reason: e.target.value.toUpperCase().trim()})}
                className="input" 
                placeholder="Ex: COMPRA FORNECEDOR X, AJUSTE DE BALANÇO..." 
              />
            </div>
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={handleSaveMovement} className="btn-primary" style={{ flex: 1, backgroundColor: movement.type === 'loss' ? '#f44336' : '#4CAF50' }}>Confirmar</button>
              <button onClick={() => setShowMovementModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
