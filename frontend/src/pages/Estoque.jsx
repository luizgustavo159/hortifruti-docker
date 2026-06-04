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
    maçã: "🍎", maca: "🍎", apple: "🍎",
    morango: "🍓", strawberry: "🍓",
    cereja: "🍒", cherry: "🍒",
    melancia: "🍉", watermelon: "🍉",
    tomate: "🍅", tomato: "🍅",
    
    // Frutas amarelas/laranjas
    banana: "🍌",
    laranja: "🍊", orange: "🍊",
    limão: "🍋", lemon: "🍋",
    abacaxi: "🍍", pineapple: "🍍",
    manga: "🥭", mango: "🥭",
    
    // Frutas roxas/azuis
    uva: "🍇", grape: "🍇",
    amora: "🫐", blueberry: "🫐",
    
    // Verduras
    brócolis: "🥦", brocolis: "🥦", broccoli: "🥦",
    cenoura: "🥕", carrot: "🥕",
    milho: "🌽", corn: "🌽",
    alface: "🥬", lettuce: "🥬",
    repolho: "🥬", cabbage: "🥬",
    espinafre: "🥬", spinach: "🥬",
    abóbora: "🎃", pumpkin: "🎃", squash: "🎃",
    batata: "🥔", potato: "🥔",
    cebola: "🧅", onion: "🧅",
    alho: "🧄", garlic: "🧄",
    pimentão: "🫑", pepper: "🫑", bell_pepper: "🫑",
    pimenta: "🌶️", chili: "🌶️",
    pepino: "🥒", cucumber: "🥒",
    abacate: "🥑", avocado: "🥑",
    cogumelo: "🍄", mushroom: "🍄",
    feijão: "🫘", beans: "🫘",
    
    // Frutas secas/sementes
    amendoim: "🥜", peanut: "🥜",
    coco: "🥥", coconut: "🥥",
    noz: "🌰", walnut: "🌰", nut: "🌰",
  };

  // ==================== FUNÇÕES DE GERAÇÃO DE IMAGEM CARICATA ====================
  // Gera SVG caricato com emoji e nome do produto
  const generateCaricatureImage = (productName) => {
    if (!productName || productName.length < 2) return "";
    
    const nameLower = productName.toLowerCase();
    let emoji = "🥬"; // padrão: verdura genérica
    
    // Busca correspondência no dicionário (verifica cada palavra)
    for (const [key, value] of Object.entries(emojiDictionary)) {
      if (nameLower.includes(key)) {
        emoji = value;
        break;
      }
    }
    
    // Gera SVG com emoji grande e nome do produto
    const svg = `
      <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="400" fill="#f0f8ff" rx="10"/>
        <circle cx="200" cy="150" r="80" fill="#e8f5e9" stroke="#4CAF50" stroke-width="3"/>
        <text x="200" y="180" font-size="120" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
        <text x="200" y="280" font-size="28" font-weight="bold" text-anchor="middle" fill="#333" font-family="Arial">${productName}</text>
        <text x="200" y="320" font-size="14" text-anchor="middle" fill="#999" font-family="Arial">Imagem Caricata</text>
      </svg>
    `;
    
    // Converte SVG para Data URL via Canvas para garantir que seja uma imagem estática pequena
    return new Promise((resolve) => {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        // Salva como JPEG com 80% de qualidade para ocupar pouquíssimo espaço
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = url;
    });
  };

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

  // ==================== FUNÇÕES DE UPLOAD E COMPRESSÃO DE IMAGEM ====================
  // Redimensiona e comprime imagem no navegador
  const compressImage = (base64Str, maxWidth = 400, maxHeight = 400) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Converte para JPEG com 70% de qualidade para garantir tamanho reduzido
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  // Upload de imagem do PC (converte para base64 e comprime)
  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result;
      if (typeof base64 === 'string') {
        // Comprime antes de salvar no estado
        const compressed = await compressImage(base64);
        setNewProduct(prev => ({ ...prev, image_url: compressed }));
        setSuccessMessage("Imagem carregada e otimizada!");
      }
    };
    reader.onerror = () => {
      setError("Erro ao ler arquivo de imagem.");
    };
    reader.readAsDataURL(file);
  };

  // Gera imagem caricata automática
  const handleGenerateCaricature = async () => {
    if (!newProduct.name || newProduct.name.length < 2) {
      setError("Digite o nome do produto primeiro (mínimo 2 caracteres)");
      return;
    }
    
    const imageUrl = await generateCaricatureImage(newProduct.name);
    setNewProduct(prev => ({ ...prev, image_url: imageUrl }));
    setSuccessMessage(`Imagem caricata gerada e otimizada para "${newProduct.name}"!`);
  };

  // ==================== FUNÇÕES DE CÓDIGO DE BARRAS ====================
  // Gera um código EAN-13 válido com dígito verificador
  const generateEAN13 = () => {
    // Gera exatamente 12 dígitos aleatórios (deixando o 13º para o dígito verificador)
    const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    
    // Calcula dígito verificador EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return base + checkDigit;
  };

  // Valida se é um EAN-13 válido
  const isValidEAN13 = (ean) => {
    if (!ean || !/^\d{13}$/.test(ean)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return parseInt(ean[12]) === checkDigit;
  };

  // Alterna seleção de produto
  const toggleProductSelection = (productId) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // Seleciona/Deseleciona todos
  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  // Exporta etiquetas em PDF
  const exportLabelsAsPDF = async () => {
    if (selectedProducts.size === 0) {
      setError("Selecione pelo menos um produto para exportar");
      return;
    }

    const productsToExport = products.filter(p => selectedProducts.has(p.id));
    
    // Usando jsPDF para criar o PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let yPosition = 10;
    const pageHeight = doc.internal.pageSize.getHeight();
    const cardHeight = 80;
    const cardWidth = 90;
    let xPosition = 10;

    for (let i = 0; i < productsToExport.length; i++) {
      const product = productsToExport[i];

      // Verificar se precisa de nova página
      if (yPosition + cardHeight > pageHeight - 10) {
        doc.addPage();
        yPosition = 10;
        xPosition = 10;
      }

      // Desenhar caixa do card
      doc.setDrawColor(200);
      doc.rect(xPosition, yPosition, cardWidth, cardHeight);

      // Adicionar imagem (se existir)
      if (product.image_url) {
        try {
          doc.addImage(product.image_url, 'JPEG', xPosition + 2, yPosition + 2, 25, 25);
        } catch (e) {
          // Se falhar, apenas continua
        }
      }

      // Adicionar nome do produto
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      const nameLines = doc.splitTextToSize(product.name, cardWidth - 35);
      doc.text(nameLines, xPosition + 30, yPosition + 5);

      // Adicionar categoria
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Cat: ${product.category_name || 'N/A'}`, xPosition + 30, yPosition + 20);

      // Adicionar preço
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text(`R$ ${Number(product.price || 0).toFixed(2)}`, xPosition + 30, yPosition + 27);

      // Adicionar código de barras (usando texto para simplicidade)
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.text(`EAN: ${product.sku}`, xPosition + 2, yPosition + 72);

      // Mover para próxima posição
      xPosition += cardWidth + 5;
      if (xPosition + cardWidth > 210) {
        xPosition = 10;
        yPosition += cardHeight + 5;
      }
    }

    doc.save('etiquetas-produtos.pdf');
    setSuccessMessage(`PDF com ${productsToExport.length} etiqueta(s) gerado com sucesso!`);
  };

  // Gera um novo código de barras
  const handleGenerateBarcode = () => {
    const newBarcode = generateEAN13();
    setNewProduct({...newProduct, sku: newBarcode});
    setSuccessMessage(`Código de barras gerado: ${newBarcode}`);
  };

  // Valida código de barras ao sair do campo
  const handleBarcodeBlur = () => {
    if (newProduct.sku && !isValidEAN13(newProduct.sku)) {
      setError(`Código de barras inválido. Deve ser um EAN-13 válido (13 dígitos).`);
    }
  };

  // Lógica de Geração de Insights (Consultoria)
  const generateInsights = () => {
    const insights = [];
    
    products.forEach(p => {
      const price = Number(p.price || 0);
      const cost = Number(p.avg_cost || 0);
      const margin = price > 0 ? ((price - cost) / price * 100) : 0;
      const target = 30; // Margem padrão simplificada

      // Alerta de Margem Baixa
      if (margin < target && price > 0) {
        insights.push({
          type: "warning",
          title: `Margem Baixa: ${p.name}`,
          text: `A margem atual é de ${margin.toFixed(1)}%, mas o alvo é ${target}%. Considere reajustar o preço.`,
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
      setNewProduct({ name: "", sku: "", category_id: "", supplier_id: "", price: "", current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "", profit_margin: "30", image_url: "" });
      loadData();
    } catch (err) { setError(err.message); }
  };

  const handleQuickPriceUpdate = async (product) => {
    const targetMargin = 30; // Simplificado
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
      setNewCategory({ name: "", description: "" });
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
        
        {/* Insights */}
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
                  <tr><th><input type="checkbox" checked={selectedProducts.size === products.length} onChange={toggleSelectAll} style={{ cursor: "pointer" }} /></th><th>Produto</th><th>Estoque</th><th>Custo Médio</th><th>Preço</th><th>Margem</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const price = Number(p.price || 0);
                    const cost = Number(p.avg_cost || 0);
                    const margin = price > 0 && cost > 0 ? ((price - cost) / cost * 100) : 0;
                    const marginStatus = p.margin_status || 'ok';
                    const marginStatusLabel = marginStatus === 'low_margin' ? '⚠️ Baixa' : marginStatus === 'high_margin' ? '📈 Alta' : '✓ OK';
                    const marginStatusColor = marginStatus === 'low_margin' ? '#f44336' : marginStatus === 'high_margin' ? '#ff9800' : '#4CAF50';
                    return (
                      <tr key={p.id} style={{ borderLeft: `4px solid ${marginStatusColor}`, backgroundColor: selectedProducts.has(p.id) ? "#e3f2fd" : "transparent" }}><td><input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => toggleProductSelection(p.id)} style={{ cursor: "pointer" }} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #eee', backgroundColor: '#f9f9f9' }}>
                              <img src={p.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div><strong>{p.name}</strong><br/><small>{p.category_name}</small></div>
                          </div>
                        </td>
                        <td><span className={Number(p.current_stock) <= Number(p.min_stock) ? "status critical" : "status_ok"}>{p.current_stock} {p.unit_type}</span></td>
                        <td>R$ {cost.toFixed(2)}</td>
                        <td>R$ {price.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span className={marginStatus === 'low_margin' ? "text-danger" : "text-success"}>{margin.toFixed(1)}%</span>
                            <span style={{ fontSize: '11px', color: marginStatusColor, fontWeight: 'bold' }}>{marginStatusLabel}</span>
                          </div>
                        </td>
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

        {activeTab === "categories" && (
          <div className="tab-content">
            <div className="inventory-header">
              <input type="text" placeholder="Buscar categoria..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
              <button className="btn-primary" onClick={() => { setSelectedCategory(null); setNewCategory({name: "", description: ""}); setShowCategoryModal(true); }}>+ Nova Categoria</button>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Nome</th><th>Descrição</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.description}</td>
                      <td>
                        <button className="btn-action" onClick={() => { setSelectedCategory(c); setNewCategory({name: c.name, description: c.description}); setShowCategoryModal(true); }}>Editar</button>
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

      {/* Modal Produto */}
      {showNewProductModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <h2>📦 {selectedProduct ? "Editar Produto" : "Novo Produto"}</h2>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                {newProduct.image_url ? (
                  <div style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #ddd' }}>
                    <img src={newProduct.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.7)', color: 'white', display: 'flex', gap: '4px', fontSize: '10px', padding: '4px' }}>
                      <button type="button" onClick={handleGenerateCaricature} style={{ flex: 1, background: '#4CAF50', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', padding: '4px' }}>🎨 Gerar</button>
                      <label style={{ flex: 1, background: '#2196F3', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', padding: '4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        📁 Upload
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '120px', height: '120px', borderRadius: '8px', border: '2px dashed #ccc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '12px', textAlign: 'center', gap: '8px' }}>
                    <div>Digite o nome para gerar</div>
                    <div style={{ display: 'flex', gap: '4px', fontSize: '10px' }}>
                      <button type="button" onClick={handleGenerateCaricature} style={{ background: '#4CAF50', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', padding: '4px 8px', fontSize: '10px' }}>🎨 Gerar</button>
                      <label style={{ background: '#2196F3', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', padding: '4px 8px', fontSize: '10px' }}>
                        📁 Upload
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Nome do Produto</label>
                <input placeholder="Ex: Maçã Gala" value={newProduct.name} onChange={e => { const val = e.target.value; setNewProduct({...newProduct, name: val}); }} className="input" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Código de Barras (EAN-13)</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    placeholder="Clique em 'Gerar' ou use o bipador" 
                    value={newProduct.sku} 
                    onChange={e => setNewProduct({...newProduct, sku: e.target.value})} 
                    onBlur={handleBarcodeBlur}
                    className="input" 
                    style={{ flex: 1 }}
                  />
                  <button 
                    type="button" 
                    onClick={handleGenerateBarcode} 
                    style={{ padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                  >
                    📱 Gerar
                  </button>
                </div>
                {newProduct.sku && isValidEAN13(newProduct.sku) && <small style={{ color: '#4CAF50' }}>✓ Código válido</small>}
                {newProduct.sku && !isValidEAN13(newProduct.sku) && <small style={{ color: '#f44336' }}>✗ Código inválido (EAN-13 esperado)</small>}
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
                <select value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})} className="input">
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

      {/* Modal Movimentação */}
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
                        const suggestedPrice = newAvgCost * (1 + 30 / 100);
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

      {/* Modal Categoria */}
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
            <div className="modal-actions">
              <button onClick={handleSaveCategory} className="btn-primary">Salvar</button>
              <button onClick={() => setShowCategoryModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fornecedor */}
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
