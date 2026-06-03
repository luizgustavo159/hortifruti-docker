import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { ApprovalModal } from "../components/ApprovalModal";
import { useScale } from "../hooks/useScale";
import "./Caixa.css";

export function Caixa() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [discounts, setDiscounts] = useState([]);
  const [manualDiscount, setManualDiscount] = useState("");
  const [tempApprovalToken, setTempApprovalToken] = useState(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [lastSale, setLastSale] = useState(null);

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

  // Ref para o leitor de código de barras
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  // Carregar dados
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const currentCaixa = await apiFetch("/pos/cash-session/current");
        setCaixaAberto(!!currentCaixa);

        const [prods, discs] = await Promise.all([
          apiFetch("/products"),
          apiFetch("/discounts")
        ]);
        setProducts(prods || []);
        setDiscounts(discs || []);
      } catch (loadError) {
        setError(loadError.message || "Falha ao carregar dados.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Listener para o leitor de código de barras
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignora se o foco estiver em um input de texto (exceto a busca principal)
      if (
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") &&
        e.target.type !== "search" && !e.target.classList.contains("barcode-friendly")
      ) {
        return;
      }

      const currentTime = Date.now();
      
      // Se o tempo entre as teclas for muito curto (< 50ms), é um leitor de código de barras
      if (currentTime - lastKeyTime.current > 50) {
        barcodeBuffer.current = "";
      }

      if (e.key === "Enter") {
        if (barcodeBuffer.current.length > 2) {
          const code = barcodeBuffer.current;
          barcodeBuffer.current = "";
          handleBarcodeScanned(code);
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }

      lastKeyTime.current = currentTime;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products]); // Re-bind quando os produtos mudarem

  const handleBarcodeScanned = (code) => {
    const product = products.find(p => p.sku === code || p.barcode === code);
    if (product) {
      addToCart(product);
      setSuccessMessage(`Bip: ${product.name}`);
      setTimeout(() => setSuccessMessage(""), 2000);
    } else {
      setError(`Produto não encontrado: ${code}`);
      setTimeout(() => setError(""), 3000);
    }
  };

  const isKgProduct = (product) => product?.unit_type === "kg";

  const findAutoDiscount = useCallback((product) => {
    return discounts.find((d) => {
      if (d.active !== 1 && d.active !== true) return false;
      if (d.target_type === "all") return true;
      if (d.target_type === "product") {
        try {
          const ids = JSON.parse(d.target_value || "[]");
          return ids.includes(product.id);
        } catch { return false; }
      }
      if (d.target_type === "category") {
        return String(d.target_value) === String(product.category_id);
      }
      return false;
    });
  }, [discounts]);

  const addToCart = useCallback((product) => {
    if (isKgProduct(product)) {
      setScaleModalProduct(product);
      setManualWeight(scale.weight ? String(scale.weight) : "");
      return;
    }

    const autoDiscount = findAutoDiscount(product);

    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1, discount_id: item.discount_id || autoDiscount?.id || null }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, discount_id: autoDiscount?.id || null }];
    });
  }, [scale.weight, findAutoDiscount]);

  const confirmWeightAndAdd = useCallback(() => {
    if (!scaleModalProduct) return;

    const weightValue = parseFloat(
      (scale.connected && scale.weight !== null ? scale.weight : manualWeight)
        ?.toString()
        .replace(",", ".")
    );

    if (isNaN(weightValue) || weightValue <= 0) {
      setError("Informe um peso válido.");
      return;
    }

    const product = scaleModalProduct;
    const autoDiscount = findAutoDiscount(product);

    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: parseFloat((item.quantity + weightValue).toFixed(3)) }
            : item
        );
      }
      return [
        ...prev,
        {
          ...product,
          quantity: parseFloat(weightValue.toFixed(3)),
          discount_id: autoDiscount?.id || null,
        },
      ];
    });

    setScaleModalProduct(null);
    setManualWeight("");
    setError("");
  }, [scaleModalProduct, scale.connected, scale.weight, manualWeight, findAutoDiscount]);

  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    const product = products.find((p) => p.id === productId);
    const isKg = isKgProduct(product);
    const parsed = isKg ? parseFloat(quantity) : parseInt(quantity);

    if (isNaN(parsed) || parsed <= 0) {
      removeFromCart(productId);
      return;
    }

    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        return { ...item, quantity: isKg ? parseFloat(parsed.toFixed(3)) : parsed };
      })
    );
  }, [removeFromCart, products]);

  const calculateTotal = () => cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const calculateItemDiscount = (item) => {
    if (!item.discount_id) return 0;
    const d = discounts.find(dis => dis.id === item.discount_id);
    if (!d) return 0;
    if (d.type === "percent") return (item.price * item.quantity) * (d.value / 100);
    if (d.type === "fixed") return d.value;
    return 0;
  };

  const total = calculateTotal();
  const totalDiscount = cartItems.reduce((sum, item) => sum + calculateItemDiscount(item), 0);
  const finalTotal = Math.max(total - totalDiscount - (parseFloat(manualDiscount) || 0), 0);

  const handleCheckout = async () => {
    if (!caixaAberto || cartItems.length === 0) return;

    setProcessingPayment(true);
    try {
      const payload = {
        items: cartItems.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          calculated_discount: calculateItemDiscount(item)
        })),
        payment_method: paymentMethod,
        amount_received: parseFloat(amountReceived || 0),
        change_amount: Math.max(parseFloat(amountReceived || 0) - finalTotal, 0)
      };

      const res = await apiFetch("/sales", { method: "POST", body: JSON.stringify(payload) });
      
      const saleData = {
        ...payload,
        id: res.id || Date.now(),
        document_number: res.document_number || res.items?.[0]?.document_number,
        items_details: cartItems,
        total: finalTotal,
        date: new Date().toLocaleString()
      };

      setLastSale(saleData);
      setCartItems([]);
      setAmountReceived("");
      setSuccessMessage("Venda realizada!");
      
      // Auto-imprimir se desejar ou apenas mostrar o botão
      // printReceipt(saleData); 

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  const printReceipt = (sale = lastSale) => {
    if (!sale) return;
    
    const printWindow = window.open("", "_blank", "width=300,height=600");
    const receiptHtml = `
      <html>
        <head>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 58mm; font-size: 12px; margin: 0; padding: 5mm; }
            .center { text-align: center; }
            .line { border-bottom: 1px dashed #000; margin: 5px 0; }
            .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .total { font-weight: bold; font-size: 14px; margin-top: 10px; }
            @media print { @page { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="center">
            <strong>HORTIFRUTI SMART</strong><br>
            CNPJ: 00.000.000/0001-00<br>
            Rua do Horti, 123 - Centro<br>
            ${sale.date}
          </div>
          <div class="line"></div>
          <div class="center">CUPOM NÃO FISCAL</div>
          <div class="line"></div>
          ${sale.items_details.map(item => `
            <div class="item">
              <span>${item.name}</span>
            </div>
            <div class="item">
              <span>${item.quantity}${item.unit_type === 'kg' ? 'kg' : 'un'} x ${item.price.toFixed(2)}</span>
              <span>R$ ${(item.quantity * item.price).toFixed(2)}</span>
            </div>
          `).join("")}
          <div class="line"></div>
          <div class="item"><span>SUBTOTAL:</span><span>R$ ${sale.total.toFixed(2)}</span></div>
          <div class="item"><span>PAGAMENTO:</span><span>${sale.payment_method.toUpperCase()}</span></div>
          ${sale.amount_received ? `<div class="item"><span>RECEBIDO:</span><span>R$ ${sale.amount_received.toFixed(2)}</span></div>` : ""}
          ${sale.change_amount ? `<div class="item"><span>TROCO:</span><span>R$ ${sale.change_amount.toFixed(2)}</span></div>` : ""}
          <div class="line"></div>
          <div class="center">OBRIGADO PELA PREFERÊNCIA!</div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  return (
    <PageShell
      title="Caixa"
      subtitle="Ponto de Venda"
      actions={
        <div style={{ display: 'flex', gap: '10px' }}>
            <button className={`btn-scale ${scale.connected ? "connected" : ""}`} onClick={scale.connected ? scale.disconnect : scale.connect}>
                ⚖️ {scale.connected ? `${scale.weight || 0} kg` : "Balança"}
            </button>
            {lastSale && (
                <button className="button" style={{ background: '#059669' }} onClick={() => printReceipt()}>
                    Print Cupom
                </button>
            )}
            <button className="button" onClick={() => navigate("/caixa/fechamento")}>Fechar Caixa</button>
        </div>
      }
    >
      <div className="pos-container">
        <div className="products-side">
          <input 
            type="search" 
            placeholder="Bipe o código ou busque pelo nome..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
            autoFocus
          />
          <div className="products-grid">
            {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                <h4>{p.name}</h4>
                <p>R$ {p.price.toFixed(2)}/{p.unit_type}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="cart-side">
          <h3>Carrinho</h3>
          {successMessage && <div className="success-message">{successMessage}</div>}
          {error && <div className="error-message">{error}</div>}
          
          <div className="cart-items">
            {cartItems.map(item => (
              <div key={item.id} className="cart-item">
                <div className="item-info">
                  <strong>{item.name}</strong>
                  <span>{item.quantity} x R$ {item.price.toFixed(2)}</span>
                </div>
                <button onClick={() => removeFromCart(item.id)}>❌</button>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <div className="total-row"><span>Total:</span> <strong>R$ {finalTotal.toFixed(2)}</strong></div>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="cash">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
            </select>
            {paymentMethod === "cash" && (
              <input type="number" placeholder="Valor recebido" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} />
            )}
            <button className="btn-checkout" disabled={processingPayment || cartItems.length === 0} onClick={handleCheckout}>
              {processingPayment ? "Processando..." : "Finalizar Venda"}
            </button>
          </div>
        </div>
      </div>

      {scaleModalProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>⚖️ Pesagem: {scaleModalProduct.name}</h3>
            <div className="weight-display">
                {scale.connected ? (
                    <div className="live-weight">{scale.weight !== null ? `${scale.weight.toFixed(3)} kg` : "Aguardando..."}</div>
                ) : (
                    <input type="number" step="0.001" placeholder="Peso manual (kg)" value={manualWeight} onChange={e => setManualWeight(e.target.value)} autoFocus />
                )}
            </div>
            <div className="modal-actions">
                <button className="btn-primary" onClick={confirmWeightAndAdd}>Confirmar</button>
                <button className="btn-secondary" onClick={() => setScaleModalProduct(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
