import { useState, useEffect, useCallback, useRef } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { useScale } from "../hooks/useScale";
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

  const scale = useScale();
  const [scaleModalProduct, setScaleModalProduct] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [prods, custs] = await Promise.all([
          apiFetch("/products"),
          apiFetch("/customers")
        ]);
        setProducts(prods || []);
        setCustomers(custs || []);
      } catch (err) { setError(err.message); }
    };
    loadData();
  }, []);

  const addToCart = (product) => {
    if (product.unit_type === 'kg') {
      setScaleModalProduct(product);
      return;
    }
    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) return prev.map(item => item.id === product.id ? {...item, quantity: item.quantity + 1} : item);
      return [...prev, {...product, quantity: 1}];
    });
  };

  const finalTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === 'fiado' && !selectedCustomer) {
        setError("Selecione um cliente para vender no fiado.");
        return;
    }

    setProcessingPayment(true);
    try {
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems.map(item => ({ product_id: item.id, quantity: item.quantity })),
          payment_method: paymentMethod,
          customer_id: selectedCustomer?.id
        }),
      });
      setSuccessMessage("Venda finalizada!");
      setCartItems([]);
      setSelectedCustomer(null);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) { setError(err.message); }
    finally { setProcessingPayment(false); }
  };

  return (
    <PageShell title="Caixa PDV" subtitle="Hortifruti Inteligente - Venda por Lotes e Fiado">
      <div className="pos-container">
        <div className="products-side">
          <input type="search" placeholder="Bipe ou busque o produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
          <div className="products-grid">
            {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                <h4>{p.name}</h4>
                <p>R$ {p.price.toFixed(2)}/{p.unit_type}</p>
                <span className="stock-info">{p.current_stock} em estoque</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cart-side">
          <h3>🛒 Carrinho</h3>
          {successMessage && <div className="success-message">{successMessage}</div>}
          {error && <div className="error-message">{error}</div>}

          <div className="customer-select">
            <label>Cliente (Opcional para Fiado)</label>
            <select value={selectedCustomer?.id || ""} onChange={e => setSelectedCustomer(customers.find(c => c.id === parseInt(e.target.value)))}>
                <option value="">Consumidor Final</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} (Débito: R$ {c.current_debt.toFixed(2)})</option>)}
            </select>
          </div>

          <div className="cart-items">
            {cartItems.map(item => (
              <div key={item.id} className="cart-item">
                <span>{item.name}</span>
                <span>{item.quantity} x R$ {item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <div className="total">Total: R$ {finalTotal.toFixed(2)}</div>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="cash">Dinheiro</option>
                <option value="pix">PIX</option>
                <option value="card">Cartão</option>
                <option value="fiado">📓 Fiado (Caderneta)</option>
            </select>
            <button className="btn-checkout" onClick={handleCheckout} disabled={processingPayment || cartItems.length === 0}>
                {processingPayment ? "Finalizando..." : "Finalizar Venda"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
