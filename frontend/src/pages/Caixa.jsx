import { useState, useEffect, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Caixa.css";

export function Caixa() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, custs, currentCaixa] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/customers"),
        apiFetch("/pos/cash-session/current")
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setCustomers(Array.isArray(custs) ? custs : []);
      setCaixaAberto(!!currentCaixa);
    } catch (err) { 
      setError("Erro ao carregar dados: " + err.message); 
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addToCart = (product) => {
    if (!caixaAberto) {
      setError("Abra o caixa antes de iniciar uma venda.");
      return;
    }
    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? {...item, quantity: item.quantity + 1} : item
        );
      }
      return [...prev, {...product, quantity: 1}];
    });
    setError("");
  };

  const removeFromCart = (productId) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCartItems(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(0.1, item.quantity + delta);
        return {...item, quantity: newQty};
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const finalTotal = subtotal;

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === 'fiado' && !selectedCustomer) {
        setError("Selecione um cliente para vender no fiado.");
        return;
    }

    setProcessingPayment(true);
    setError("");
    try {
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems.map(item => ({ 
            product_id: item.id, 
            quantity: item.quantity 
          })),
          payment_method: paymentMethod,
          customer_id: selectedCustomer?.id || null
        }),
      });
      setSuccessMessage("Venda finalizada com sucesso!");
      setCartItems([]);
      setSelectedCustomer(null);
      loadData(); // Atualiza estoque
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { 
      setError(err.message); 
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <PageShell title="Frente de Caixa" subtitle="Ponto de Venda - Registre vendas em tempo real">
      <div className="pos-container">
        {/* Lado Esquerdo: Produtos */}
        <div className="pos-products">
          <div className="search-section">
            <input 
              type="search" 
              placeholder="Bipe ou busque o produto..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="search-input" 
            />
          </div>
          
          <div className="products-grid">
            {loading ? (
              <div className="loading">Carregando produtos...</div>
            ) : products.filter(p => 
              p.name.toLowerCase().includes(searchTerm.toLowerCase())
            ).length === 0 ? (
              <div className="no-products">Nenhum produto encontrado.</div>
            ) : (
              products.filter(p => 
                p.name.toLowerCase().includes(searchTerm.toLowerCase())
              ).map(p => (
                <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                  <div className="product-info">
                    <h4>{p.name}</h4>
                    <p className="product-category">{p.category_name || 'Hortifruti'}</p>
                    <p className={`product-stock ${Number(p.current_stock) <= Number(p.min_stock) ? 'critical' : ''}`}>
                      Estoque: {p.current_stock} {p.unit_type}
                    </p>
                    <p className="product-price">R$ {Number(p.price).toFixed(2)}</p>
                  </div>
                  <button className="btn-add-cart">Adicionar</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Direito: Carrinho */}
        <div className="pos-cart">
          <h3>🛒 Carrinho de Vendas</h3>
          
          {!caixaAberto && <div className="error-message" style={{background: '#fef2f2', color: '#dc2626'}}>⚠️ CAIXA FECHADO</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}
          {error && <div className="error-message">{error}</div>}

          <div className="customer-section" style={{ marginBottom: '16px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '10px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>CLIENTE / CADERNETA</label>
            <select 
              className="input"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
              value={selectedCustomer?.id || ""} 
              onChange={e => setSelectedCustomer(customers.find(c => c.id === parseInt(e.target.value)))}
            >
                <option value="">Consumidor Final</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Débito: R$ {Number(c.current_debt || 0).toFixed(2)})
                  </option>
                ))}
            </select>
          </div>

          <div className="cart-items">
            {cartItems.length === 0 ? (
              <div className="cart-empty">Carrinho vazio</div>
            ) : (
              cartItems.map(item => (
                <div key={item.id} className="cart-item">
                  <div className="item-details">
                    <h5>{item.name}</h5>
                    <span className="item-price">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                  </div>
                  <div className="item-quantity">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}>-</button>
                      <input 
                        type="number" 
                        value={item.quantity} 
                        readOnly
                        style={{ width: '50px', textAlign: 'center' }}
                      />
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }}>+</button>
                    </div>
                    <button className="cart-item-remove" onClick={() => removeFromCart(item.id)}>Remover</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-summary" style={{ marginTop: 'auto' }}>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>TOTAL A PAGAR</span>
              <span className="value">R$ {finalTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="payment-section" style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-info)' }}>FORMA DE PAGAMENTO</label>
            <select 
              className="payment-select"
              value={paymentMethod} 
              onChange={e => setPaymentMethod(e.target.value)}
              style={{ marginTop: '4px' }}
            >
                <option value="cash">💵 Dinheiro</option>
                <option value="pix">📱 PIX</option>
                <option value="card">💳 Cartão</option>
                <option value="fiado">📓 Fiado (Caderneta)</option>
            </select>
          </div>

          <div className="cart-actions" style={{ marginTop: '16px' }}>
            <button 
              className="btn-finalize" 
              onClick={handleCheckout} 
              disabled={processingPayment || cartItems.length === 0 || !caixaAberto}
              style={{ height: '56px', fontSize: '16px' }}
            >
                {processingPayment ? "PROCESSANDO..." : "FINALIZAR VENDA"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
