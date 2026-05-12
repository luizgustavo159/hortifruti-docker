import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';
import './CaixaFocusMode.css';

export function CaixaFocusMode() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('dinheiro');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
    // Modo tela cheia
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const loadProducts = async () => {
    try {
      const data = await apiFetch('/api/products');
      setProducts(data || []);
    } catch (error) {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const handleQuantityChange = (productId, quantity) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
    } else {
      setCart(
        cart.map((item) =>
          item.id === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  const handleFinalizeSale = async () => {
    if (cart.length === 0) {
      toast.error('Carrinho vazio!');
      return;
    }

    try {
      const saleData = {
        items: cart.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.price,
        })),
        payment_method: selectedPayment,
        total: calculateTotal(),
      };

      await apiFetch('/api/sales', { method: 'POST', body: saleData });
      toast.success('Venda finalizada com sucesso!');
      setCart([]);
      setSearchTerm('');
    } catch (error) {
      toast.error('Erro ao finalizar venda: ' + error.message);
    }
  };

  const handleClearCart = () => {
    if (window.confirm('Limpar carrinho?')) {
      setCart([]);
    }
  };

  const handleExitFocusMode = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate('/caixa');
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateTotal = () =>
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (loading) {
    return <div className="focus-loading">Carregando...</div>;
  }

  return (
    <div className="caixa-focus-mode">
      {/* Header */}
      <div className="focus-header">
        <h1>🛒 MODO FOCO - FRENTE DE CAIXA</h1>
        <button className="exit-btn" onClick={handleExitFocusMode}>
          ✕ Sair do Modo Foco
        </button>
      </div>

      <div className="focus-content">
        {/* Área de Produtos */}
        <div className="focus-products">
          <input
            type="text"
            placeholder="🔍 Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="focus-search"
            autoFocus
          />

          <div className="focus-products-grid">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                className="focus-product-btn"
                onClick={() => handleAddToCart(product)}
              >
                <div className="product-name">{product.name}</div>
                <div className="product-price">R$ {product.price.toFixed(2)}</div>
                <div className="product-stock">Est: {product.stock}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Carrinho */}
        <div className="focus-cart">
          <h2>💳 CARRINHO</h2>

          <div className="focus-cart-items">
            {cart.length === 0 ? (
              <p className="empty-cart">Carrinho vazio</p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="focus-cart-item">
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    <div className="item-price">R$ {item.price.toFixed(2)}</div>
                  </div>
                  <div className="item-controls">
                    <button
                      onClick={() =>
                        handleQuantityChange(item.id, item.quantity - 1)
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        handleQuantityChange(item.id, parseInt(e.target.value))
                      }
                    />
                    <button
                      onClick={() =>
                        handleQuantityChange(item.id, item.quantity + 1)
                      }
                    >
                      +
                    </button>
                  </div>
                  <div className="item-total">
                    R$ {(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="focus-cart-summary">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>R$ {calculateTotal().toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>TOTAL:</span>
              <span>R$ {calculateTotal().toFixed(2)}</span>
            </div>
          </div>

          <div className="focus-payment">
            <label>Forma de Pagamento:</label>
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
            >
              <option value="dinheiro">💵 Dinheiro</option>
              <option value="credito">💳 Crédito</option>
              <option value="debito">🏧 Débito</option>
              <option value="pix">📱 PIX</option>
            </select>
          </div>

          <div className="focus-actions">
            <button className="btn-clear" onClick={handleClearCart}>
              🗑️ Limpar
            </button>
            <button className="btn-finalize" onClick={handleFinalizeSale}>
              ✓ Finalizar Venda
            </button>
          </div>
        </div>
      </div>

      {/* Atalhos */}
      <div className="focus-shortcuts">
        <span>F1: Busca | F10: Finalizar | ESC: Sair</span>
      </div>
    </div>
  );
}
