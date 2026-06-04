import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { ApprovalModal } from "../components/ApprovalModal";
import { useScale } from "../hooks/useScale";
import "./Caixa.css";

export function Caixa() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedDiscount, setSelectedDiscount] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [manualDiscount, setManualDiscount] = useState("");
  const [showManualDiscountApproval, setShowManualDiscountApproval] = useState(false);
  const [tempApprovalToken, setTempApprovalToken] = useState(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Estado do Caixa
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [showAberturaModal, setShowAberturaModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");

  // Balança
  const scale = useScale();
  const [scaleModalProduct, setScaleModalProduct] = useState(null);
  const [manualWeight, setManualWeight] = useState("");

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentCaixa = await apiFetch("/pos/cash-session/current");
      setCaixaAberto(!!currentCaixa);

      const [prods, disc, custs] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/discounts"),
        apiFetch("/customers")
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setDiscounts(Array.isArray(disc) ? disc : []);
      setCustomers(Array.isArray(custs) ? custs : []);
    } catch (err) {
      setError("Falha ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lógica de Teclado (Leitor e Atalhos)
  useEffect(() => {
    let barcode = "";
    const handleKeyDown = (e) => {
      // Atalho F10 para finalizar
      if (e.key === "F10") {
        e.preventDefault();
        handleCheckout();
        return;
      }

      if (e.key === "Enter") {
        if (barcode.length > 3) {
          const product = products.find(p => p.sku === barcode || p.barcode === barcode);
          if (product) addToCart(product);
          barcode = "";
        }
      } else if (e.key !== "Shift" && e.key.length === 1) {
        barcode += e.key;
      }
      
      // Limpar barcode se demorar muito
      const timer = setTimeout(() => { barcode = ""; }, 100);
      return () => clearTimeout(timer);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products, cartItems, paymentMethod, caixaAberto]); // Dependências atualizadas para handleCheckout funcionar via atalho

  const isKgProduct = (product) => product?.unit_type === "kg";

  const findAutoDiscount = useCallback((product) => {
    return discounts.find((d) => {
      if (!d.active) return false;
      if (d.target_type === "all") return true;
      if (d.target_type === "product") {
        try {
          const ids = JSON.parse(d.target_value || "[]");
          return ids.includes(product.id);
        } catch { return false; }
      }
      if (d.target_type === "category") return String(d.target_value) === String(product.category_id);
      return false;
    });
  }, [discounts]);

  const addToCart = useCallback((product) => {
    if (!caixaAberto) {
      setError("O caixa está fechado.");
      return;
    }
    if (isKgProduct(product)) {
      setScaleModalProduct(product);
      setManualWeight(scale.weight ? String(scale.weight) : "");
      return;
    }

    // Validação preventiva de estoque
    const existingInCart = cartItems.find(item => item.id === product.id);
    const currentQtyInCart = existingInCart ? existingInCart.quantity : 0;
    if (product.current_stock <= currentQtyInCart) {
      setError(`Estoque insuficiente para ${product.name}. Disponível: ${product.current_stock}`);
      setTimeout(() => setError(""), 3000);
      return;
    }

    const autoDiscount = findAutoDiscount(product);
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, discount_id: autoDiscount?.id || null }];
    });
  }, [caixaAberto, scale.weight, findAutoDiscount]);

  const confirmWeightAndAdd = useCallback(() => {
    if (!scaleModalProduct) return;
    const weightValue = parseFloat((scale.connected && scale.weight !== null ? scale.weight : manualWeight)?.toString().replace(",", "."));
    if (isNaN(weightValue) || weightValue <= 0) {
      setError("Informe um peso válido.");
      return;
    }

    const autoDiscount = findAutoDiscount(scaleModalProduct);
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === scaleModalProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.id === scaleModalProduct.id ? { ...item, quantity: parseFloat((item.quantity + weightValue).toFixed(3)) } : item
        );
      }
      return [...prev, { ...scaleModalProduct, quantity: parseFloat(weightValue.toFixed(3)), discount_id: autoDiscount?.id || null }];
    });
    setScaleModalProduct(null);
    setManualWeight("");
  }, [scaleModalProduct, scale.connected, scale.weight, manualWeight, findAutoDiscount]);

  const updateQuantity = (productId, quantity) => {
    const product = products.find(p => p.id === productId);
    const isKg = isKgProduct(product);
    const parsed = isKg ? parseFloat(quantity) : parseInt(quantity);
    if (isNaN(parsed) || parsed <= 0) {
      setCartItems(prev => prev.filter(item => item.id !== productId));
      return;
    }
    setCartItems(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity: isKg ? parseFloat(parsed.toFixed(3)) : parsed } : item
    ));
  };

  const calculateTotal = () => cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const calculateDiscountForItem = (item) => {
    if (!item.discount_id) return 0;
    const d = discounts.find(disc => disc.id === item.discount_id);
    if (!d || !d.active) return 0;

    // Verificar validade de data (Timezone simplificado para o navegador)
    const now = new Date();
    if (d.starts_at && new Date(d.starts_at) > now) return 0;
    if (d.ends_at && new Date(d.ends_at) < now) return 0;

    const subtotal = item.price * item.quantity;

    switch (d.type) {
      case "percent":
        return subtotal * (Number(d.value) / 100);
      case "fixed":
        return Number(d.value);
      case "buy_x_get_y":
        // Ex: Leve 3 Pague 2. buy_quantity=3, get_quantity=2
        if (item.quantity >= d.buy_quantity && d.buy_quantity > 0) {
          const sets = Math.floor(item.quantity / d.buy_quantity);
          const freeItemsPerSet = d.buy_quantity - d.get_quantity;
          return sets * freeItemsPerSet * item.price;
        }
        return 0;
      case "fixed_bundle":
        // Ex: 3 por R$ 10,00. value=10, min_quantity=3
        if (item.quantity >= d.min_quantity && d.min_quantity > 0) {
          const bundles = Math.floor(item.quantity / d.min_quantity);
          const normalPriceForBundles = bundles * d.min_quantity * item.price;
          const bundlePrice = bundles * Number(d.value);
          return normalPriceForBundles - bundlePrice;
        }
        return 0;
      default:
        return 0;
    }
  };

  const subtotal = calculateTotal();
  const totalDiscount = cartItems.reduce((sum, item) => sum + calculateDiscountForItem(item), 0);
  const finalTotal = Math.max(subtotal - totalDiscount - (parseFloat(manualDiscount) || 0), 0);

  const handleOpenCaixaRequest = (e) => {
    e.preventDefault();
    if (!openingAmount || isNaN(openingAmount)) { setError("Informe um valor válido."); return; }
    setShowApprovalModal(true);
  };

  const handleAberturaAprovada = async (token) => {
    try {
      await apiFetch("/pos/cash-session/open", {
        method: "POST",
        body: JSON.stringify({ opening_amount: parseFloat(openingAmount), notes: openingNotes, approval_token: token }),
      });
      setCaixaAberto(true);
      setShowAberturaModal(false);
      setShowApprovalModal(false);
      setSuccessMessage("Caixa aberto!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
  };

  const handleCheckout = async () => {
    if (!caixaAberto || cartItems.length === 0) return;
    setProcessingPayment(true);
    try {
      const response = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems.map(item => ({ product_id: item.id, quantity: item.quantity, discount_id: item.discount_id })),
          payment_method: paymentMethod,
          customer_id: selectedCustomer?.id || null,
          manual_discount: parseFloat(manualDiscount) || 0,
          approval_token: tempApprovalToken
        }),
      });
      
      // Lógica de Impressão Térmica (Simulada via Window Print ou API)
      if (window.confirm("Venda realizada! Deseja imprimir o cupom?")) {
          console.log("Enviando para impressora térmica...");
          // window.print(); // Ou chamada para serviço de impressão local
      }

      setSuccessMessage("Venda finalizada!");
      setCartItems([]);
      setManualDiscount("");
      setTempApprovalToken(null);
      loadData();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) { setError(err.message); }
    finally { setProcessingPayment(false); }
  };

  return (
    <PageShell 
      title="Frente de Caixa" 
      subtitle="Ponto de Venda Profissional"
      actions={
        <div className="pos-actions">
          <button className={`btn-scale ${scale.connected ? "connected" : ""}`} onClick={scale.connected ? scale.disconnect : scale.connect}>
            ⚖️ {scale.connected ? `Balança: ${scale.weight || "0.000"} kg` : "Conectar Balança"}
          </button>
          <button className="btn-movimentacao" onClick={() => navigate("/caixa/fechamento")}>💰 Fechar Caixa</button>
          <button className="btn-focus-mode" onClick={() => navigate("/caixa/focus")}>🎯 Modo Foco</button>
        </div>
      }
    >
      {showAberturaModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Abertura de Caixa</h3>
            <input type="number" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="Valor Inicial R$" className="input" autoFocus />
            <textarea value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} placeholder="Observações" className="input" />
            <div style={{display:'flex', gap:'8px', marginTop:'16px'}}>
                <button onClick={handleOpenCaixaRequest} className="btn-finalize" style={{flex:1}}>Solicitar Abertura</button>
                <button onClick={() => setShowAberturaModal(false)} className="button button-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && (
        <ApprovalModal action="open_cash_session" onApproved={handleAberturaAprovada} onCancel={() => setShowApprovalModal(false)} />
      )}

      {scaleModalProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>⚖️ Pesagem: {scaleModalProduct.name}</h3>
            <div className="weight-display">
                {scale.connected ? `${(scale.weight || 0).toFixed(3)} kg` : (
                    <input type="number" value={manualWeight} onChange={e => setManualWeight(e.target.value)} placeholder="0.000" className="weight-input" autoFocus />
                )}
            </div>
            <div style={{display:'flex', gap:'8px', marginTop:'16px'}}>
                <button onClick={confirmWeightAndAdd} className="btn-finalize" style={{flex:1}}>Confirmar</button>
                <button onClick={() => setScaleModalProduct(null)} className="button button-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="pos-container">
        <div className="pos-products">
          <div className="search-section">
            <input type="text" placeholder="Busque ou Bipe o Código..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
            {!caixaAberto && <button onClick={() => setShowAberturaModal(true)} className="btn-open-caixa">🔓 Abrir Caixa</button>}
          </div>

          <div className="products-grid">
            {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku === searchTerm).map(p => (
              <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                <div className="product-emoji" style={{ fontSize: '2rem' }}>
                  {getEmojiForProduct(p.name)}
                </div>
                <div className="product-info">
                  <h4>{p.name}</h4>
                  <p className="product-price">R$ {Number(p.price).toFixed(2)}</p>
                  <p className="product-stock" style={{ fontSize: '10px', opacity: 0.8 }}>
                    Estoque: {p.current_stock} {p.unit_type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pos-cart">
          <h3>🛒 Carrinho</h3>
          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}

          <div className="customer-select">
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Cliente</label>
            <select value={selectedCustomer?.id || ""} onChange={e => setSelectedCustomer(customers.find(c => c.id === parseInt(e.target.value)))} className="payment-select">
              <option value="">Consumidor Final</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="payment-section">
            <label>Valor Recebido</label>
            <input 
              type="number" 
              value={amountReceived} 
              onChange={e => setAmountReceived(e.target.value)} 
              placeholder="R$ 0,00"
              className="search-input"
              style={{ padding: '8px 12px' }}
            />
            {amountReceived && parseFloat(amountReceived) > finalTotal && (
              <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                Troco: R$ {(parseFloat(amountReceived) - finalTotal).toFixed(2)}
              </div>
            )}
          </div>

          <div className="cart-items">
            {cartItems.map(item => (
              <div key={item.id} className="cart-item">
                <div className="item-info">
                  <span>{item.name}</span>
                  <small>R$ {item.price.toFixed(2)} x {item.quantity}</small>
                </div>
                <div className="item-qty-controls">
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
                <span className="item-subtotal">R$ {(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="summary-line"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
            <div className="summary-line total"><span>TOTAL</span><span>R$ {finalTotal.toFixed(2)}</span></div>
          </div>

          <div className="cart-footer">
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="payment-select">
              <option value="cash">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="fiado">Fiado</option>
            </select>
            <button className="btn-finalize" onClick={handleCheckout} disabled={processingPayment || cartItems.length === 0 || !caixaAberto}>
              {processingPayment ? "PROCESSANDO..." : "FINALIZAR (F10)"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
