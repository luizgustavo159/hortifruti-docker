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
  const [selectedPayment, setSelectedPayment] = useState('cash');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    loadData();
    enterFullscreen();
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
      setLoading(true);
      setError('');
      
      // Verificar se o caixa está aberto primeiro
      const currentCaixa = await apiFetch('/pos/cash-session/current');
      if (!currentCaixa) {
        setError('O caixa precisa estar aberto para usar o Modo Foco.');
        setTimeout(() => navigate('/caixa'), 3000);
        return;
      }

      const promises = [apiFetch('/products')];
      
      // Todos os operadores precisam ver descontos para que sejam aplicados no caixa
      promises.push(apiFetch('/discounts'));

      const results = await Promise.allSettled(promises);
      
      if (results[0].status === 'fulfilled') {
        const prodData = results[0].value;
        setProducts(Array.isArray(prodData) ? prodData : (prodData?.data || []));
      } else {
        throw new Error(results[0].reason?.message || 'Falha ao carregar produtos');
      }

      if (results[1]?.status === 'fulfilled') {
        const discData = results[1].value;
        setDiscounts(Array.isArray(discData) ? discData : (discData?.data || []));
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados do sistema: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductStock = (product) => Number(product.current_stock ?? product.stock ?? 0);
  const formatCurrency = (value) => Number(value || 0).toFixed(2);

  const handleAddToCart = useCallback((product) => {
    const availableStock = getProductStock(product);
    if (availableStock <= 0) {
      setError('Produto sem estoque disponível.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const existing = cart.find((item) => item.id === product.id);

    // Tentar encontrar um desconto automático para este produto
    const autoDiscount = discounts.find(d => {
      if (d.active !== 1 && d.active !== true) return false;
      if (d.target_type === 'all') return true;
      if (d.target_type === 'product') {
        try {
          const ids = JSON.parse(d.target_value || "[]");
          return ids.includes(product.id);
        } catch { return false; }
      }
      if (d.target_type === 'category') {
        return String(d.target_value) === String(product.category_id);
      }
      return false;
    });

    if (existing) {
      if (existing.quantity >= availableStock) {
        setError('Quantidade maior que o estoque disponível.');
        setTimeout(() => setError(''), 3000);
        return;
      }
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1, discount_id: item.discount_id || autoDiscount?.id || null }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1, discount_id: autoDiscount?.id || null }]);
    }
  }, [cart, discounts]);

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const handleQuantityChange = (productId, quantity) => {
    const num = parseInt(quantity) || 0;
    if (num <= 0) {
      handleRemoveFromCart(productId);
    } else {
      const item = cart.find((cartItem) => cartItem.id === productId);
      const availableStock = item ? getProductStock(item) : num;
      const safeQuantity = Math.min(num, availableStock);
      if (safeQuantity < num) {
        setError('Quantidade ajustada ao estoque disponível.');
        setTimeout(() => setError(''), 3000);
      }
      setCart(
        cart.map((cartItem) => {
          if (cartItem.id !== productId) return cartItem;
          
          let discountId = cartItem.discount_id;
          if (!discountId) {
            const autoDiscount = discounts.find(d => {
              if (d.active !== 1 && d.active !== true) return false;
              if (d.target_type === 'all') return true;
              if (d.target_type === 'product') {
                try {
                  const ids = JSON.parse(d.target_value || "[]");
                  return ids.includes(cartItem.id);
                } catch { return false; }
              }
              if (d.target_type === 'category') {
                return String(d.target_value) === String(cartItem.category_id);
              }
              return false;
            });
            discountId = autoDiscount?.id || null;
          }
          
          return { ...cartItem, quantity: safeQuantity, discount_id: discountId };
        })
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
    const quantity = item.quantity;
    let discountAmount = 0;

    if (discount.type === 'percent') {
      discountAmount = itemTotal * (Number(discount.value) / 100);
    } else if (discount.type === 'fixed') {
      discountAmount = Number(discount.value);
    } else if (discount.type === 'buy_x_get_y') {
      const buyQty = Number(discount.buy_quantity);
      const getQty = Number(discount.get_quantity);
      if (buyQty > 0 && quantity >= buyQty) {
        discountAmount = Number(item.price) * getQty;
      }
    } else if (discount.type === 'fixed_bundle') {
      const bundleQty = Number(discount.buy_quantity);
      const bundlePrice = Number(discount.value);
      if (bundleQty > 0 && bundlePrice >= 0) {
        const bundles = Math.floor(quantity / bundleQty);
        const remainder = quantity % bundleQty;
        const bundleTotal = bundles * bundlePrice;
        const remainderTotal = remainder * Number(item.price);
        discountAmount = itemTotal - (bundleTotal + remainderTotal);
      }
    }

    if (discount.min_quantity && quantity < Number(discount.min_quantity)) {
      discountAmount = 0;
    }

    return Math.max(discountAmount, 0);
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
    // Verificar se o caixa está aberto (segurança extra)
    try {
      const currentCaixa = await apiFetch('/pos/cash-session/current');
      if (!currentCaixa) {
        setError('O caixa foi fechado em outra aba ou sessão. Não é possível vender.');
        setTimeout(() => navigate('/caixa'), 3000);
        return;
      }
    } catch (e) {
      setError('Erro ao validar status do caixa.');
      return;
    }

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
        calculated_discount: calculateItemDiscount(item)
      }));

      const response = await apiFetch('/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: saleItems,
          payment_method: selectedPayment,
        }),
      });

      // Tratar resposta corretamente - pode ser multi-item ou single-item
      let documentNumber = response.document_number;
      if (!documentNumber && response.items && response.items.length > 0) {
        documentNumber = response.items[0].document_number;
      }

      setSuccessMessage(
        `✅ Venda finalizada! Doc: ${documentNumber || response.id || 'OK'}`
      );
      setCart([]);
      setSearchTerm('');
      setSelectedPayment('cash');

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

  useEffect(() => {
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
  }, [cart, selectedPayment, processingPayment]);

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
                  disabled={getProductStock(product) <= 0}
                >
                  <div className="product-name">{product.name}</div>
                  <div className="product-price">R$ {formatCurrency(product.price)}</div>
                  <div className="product-stock">
                    {getProductStock(product) > 0 ? `Est: ${getProductStock(product)}` : 'Sem estoque'}
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
                    <div className="item-price">R$ {formatCurrency(item.price)}</div>
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
                <span>Desc. Auto:</span>
                <span>-R$ {totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="summary-row discount manual" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
              <span>Desc. Manual (R$):</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={manualDiscount}
                  onChange={(e) => setManualDiscount(e.target.value)}
                  onBlur={() => {
                    if (parseFloat(manualDiscount) > 0 && !tempApprovalToken) {
                      setShowManualDiscountApproval(true);
                    }
                  }}
                  placeholder="0.00"
                  style={{ width: '80px', textAlign: 'right', padding: '4px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid #444' }}
                />
                {tempApprovalToken && <span title="Autorizado" style={{ color: '#10b981' }}>✅</span>}
              </div>
            </div>
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
              <option value="cash">💵 Dinheiro</option>
              <option value="credit">💳 Crédito</option>
              <option value="debit">🏧 Débito</option>
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
