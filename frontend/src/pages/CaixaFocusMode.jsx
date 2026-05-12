import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import './CaixaFocusMode.css';

export function CaixaFocusMode() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('dinheiro');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    loadData();
    enterFullscreen();

    // Atalhos de teclado
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        handleExitFocusMode();
      } else if (e.key === 'F1') {
        e.preventDefault();
        document.querySelector('.focus-search')?.focus();
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleFinalizeSale();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (err) {
      console.warn('Fullscreen não disponível:', err);
    }
  };

  const loadData = async () => {
    try {
      const [productsData, discountsData] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/discounts'),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setDiscounts(Array.isArray(discountsData) ? discountsData : []);
      setError('');
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados do sistema');
      setProducts([]);
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = useCallback((product) => {
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
      setCart([...cart, { ...product, quantity: 1, discount_id: null }]);
    }
  }, [cart]);

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const handleQuantityChange = (productId, quantity) => {
    const num = parseInt(quantity) || 0;
    if (num <= 0) {
      handleRemoveFromCart(productId);
    } else {
      setCart(
        cart.map((item) =>
          item.id === productId ? { ...item, quantity: num } : item
        )
      );
    }
  };

  const handleApplyDiscount = (itemId, discountId) => {
    setCart(
      cart.map((item) =>
        item.id === itemId
          ? { ...item, discount_id: discountId === item.discount_id ? null : discountId }
          : item
      )
    );
  };

  const calculateItemDiscount = (item) => {
    if (!item.discount_id) return 0;
    const discount = discounts.find((d) => d.id === item.discount_id);
    if (!discount) return 0;

    const itemTotal = item.price * item.quantity;
    if (discount.type === 'percent') {
      return itemTotal * (discount.value / 100);
    } else if (discount.type === 'fixed') {
      return Math.min(discount.value, itemTotal);
    }
    return 0;
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const calculateTotalDiscount = () => {
    return cart.reduce((sum, item) => sum + calculateItemDiscount(item), 0);
  };

  const total = calculateTotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal = total - totalDiscount;

  const handleFinalizeSale = async () => {
    if (cart.length === 0) {
      setError('Carrinho vazio!');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setProcessingPayment(true);
    setError('');
    setSuccessMessage('');

    try {
      const saleItems = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        discount_id: item.discount_id,
      }));

      const response = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: saleItems,
          payment_method: selectedPayment,
        }),
      });

      setSuccessMessage(
        `✅ Venda finalizada! Doc: ${response.document_number || response.id}`
      );
      setCart([]);
      setSearchTerm('');
      setSelectedPayment('dinheiro');

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Erro ao finalizar venda:', err);
      setError('Erro ao finalizar venda: ' + err.message);
      setTimeout(() => setError(''), 3000);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleClearCart = () => {
    if (window.confirm('Limpar carrinho?')) {
      setCart([]);
    }
  };

  const handleExitFocusMode = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err) {
      console.warn('Erro ao sair do fullscreen:', err);
    }
    navigate('/caixa');
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      {/* Mensagens */}
      {error && <div className="focus-error">{error}</div>}
      {successMessage && <div className="focus-success">{successMessage}</div>}

      <div className="focus-content">
        {/* Área de Produtos */}
        <div className="focus-products">
          <input
            type="text"
            placeholder="🔍 Buscar produto (F1)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="focus-search"
            autoFocus
          />

          <div className="focus-products-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className="focus-product-btn"
                  onClick={() => handleAddToCart(product)}
                  disabled={product.stock <= 0}
                >
                  <div className="product-name">{product.name}</div>
                  <div className="product-price">R$ {(product.price || 0).toFixed(2)}</div>
                  <div className="product-stock">
                    {product.stock > 0 ? `Est: ${product.stock}` : 'Sem estoque'}
                  </div>
                </button>
              ))
            ) : (
              <div className="no-products">Nenhum produto encontrado</div>
            )}
          </div>
        </div>

        {/* Carrinho */}
        <div className="focus-cart">
          <h2>💳 CARRINHO ({cart.length})</h2>

          <div className="focus-cart-items">
            {cart.length === 0 ? (
              <p className="empty-cart">Carrinho vazio</p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="focus-cart-item">
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    <div className="item-price">R$ {(item.price || 0).toFixed(2)}</div>
                    {item.discount_id && (
                      <div className="item-discount">
                        -R$ {calculateItemDiscount(item).toFixed(2)}
                      </div>
                    )}
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
                      value={item.quantity || 1}
                      onChange={(e) =>
                        handleQuantityChange(item.id, e.target.value)
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
                    R$ {((item.price || 0) * (item.quantity || 0) - calculateItemDiscount(item)).toFixed(2)}
                  </div>
                  <button
                    className="item-remove"
                    onClick={() => handleRemoveFromCart(item.id)}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Descontos */}
          {cart.length > 0 && discounts.length > 0 && (
            <div className="focus-discounts">
              <label>Descontos Disponíveis:</label>
              <div className="discounts-list">
                {discounts.map((discount) => (
                  <button
                    key={discount.id}
                    className="discount-btn"
                    onClick={() => {
                      if (cart.length > 0) {
                        handleApplyDiscount(cart[0].id, discount.id);
                      }
                    }}
                  >
                    {discount.name} ({discount.value}
                    {discount.type === 'percent' ? '%' : 'R$'})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="focus-cart-summary">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="summary-row discount">
                <span>Desconto:</span>
                <span>-R$ {totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="summary-row total">
              <span>TOTAL:</span>
              <span>R$ {finalTotal.toFixed(2)}</span>
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
            <button 
              className="btn-clear" 
              onClick={handleClearCart}
              disabled={cart.length === 0}
            >
              🗑️ Limpar
            </button>
            <button 
              className="btn-finalize" 
              onClick={handleFinalizeSale}
              disabled={cart.length === 0 || processingPayment}
            >
              {processingPayment ? '⏳ Processando...' : '✓ Finalizar (F10)'}
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
