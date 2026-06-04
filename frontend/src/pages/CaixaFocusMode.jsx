import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useScale } from '../hooks/useScale';
// import { RelogioGlobal } from '../components/RelogioGlobal';
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
  const [manualDiscount, setManualDiscount] = useState('');
  const [tempApprovalToken, setTempApprovalToken] = useState(null);
  const [showManualDiscountApproval, setShowManualDiscountApproval] = useState(false);

  // Balança
  const scale = useScale();
  const [scaleModalProduct, setScaleModalProduct] = useState(null);
  const [manualWeight, setManualWeight] = useState('');

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
      const currentCaixa = await apiFetch('/pos/cash-session/current');
      if (!currentCaixa) {
        setError('O caixa precisa estar aberto para usar o Modo Foco.');
        setTimeout(() => navigate('/caixa'), 3000);
        return;
      }
      const promises = [apiFetch('/products')];
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
      setError('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductStock = (product) => Number(product.current_stock ?? product.stock ?? 0);
  const formatCurrency = (value) => Number(value || 0).toFixed(2);
  const isKgProduct = (product) => product?.unit_type === 'kg';

  const findAutoDiscount = useCallback((product) => {
    return discounts.find((d) => {
      if (d.active !== 1 && d.active !== true) return false;
      if (d.target_type === 'all') return true;
      if (d.target_type === 'product') {
        try { const ids = JSON.parse(d.target_value || '[]'); return ids.includes(product.id); }
        catch { return false; }
      }
      if (d.target_type === 'category') return String(d.target_value) === String(product.category_id);
      return false;
    });
  }, [discounts]);

  const handleAddToCart = useCallback((product) => {
    const availableStock = getProductStock(product);

    if (isKgProduct(product)) {
      setScaleModalProduct(product);
      setManualWeight(scale.weight ? String(scale.weight) : '');
      return;
    }

    if (availableStock <= 0) {
      setError('Produto sem estoque disponível.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const autoDiscount = findAutoDiscount(product);
    const existing = cart.find((item) => item.id === product.id);

    if (existing) {
      if (existing.quantity >= availableStock) {
        setError('Quantidade maior que o estoque disponível.');
        setTimeout(() => setError(''), 3000);
        return;
      }
      setCart(cart.map((item) =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1, discount_id: item.discount_id || autoDiscount?.id || null }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1, discount_id: autoDiscount?.id || null }]);
    }
  }, [cart, discounts, scale.weight, findAutoDiscount]);

  const confirmWeightAndAdd = useCallback(() => {
    if (!scaleModalProduct) return;
    const weightValue = parseFloat(
      (scale.connected && scale.weight !== null ? scale.weight : manualWeight)
        ?.toString().replace(',', '.')
    );
    if (isNaN(weightValue) || weightValue <= 0) {
      setError('Informe um peso válido (maior que zero).');
      return;
    }
    const product = scaleModalProduct;
    const autoDiscount = findAutoDiscount(product);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: parseFloat((item.quantity + weightValue).toFixed(3)) }
            : item
        );
      }
      return [...prev, { ...product, quantity: parseFloat(weightValue.toFixed(3)), discount_id: autoDiscount?.id || null }];
    });
    setScaleModalProduct(null);
    setManualWeight('');
    setError('');
  }, [scaleModalProduct, scale.connected, scale.weight, manualWeight, findAutoDiscount]);

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const handleQuantityChange = (productId, quantity) => {
    const item = cart.find((i) => i.id === productId);
    const isKg = isKgProduct(item);
    const num = isKg ? parseFloat(quantity) : parseInt(quantity);
    if (isNaN(num) || num <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    const availableStock = item ? getProductStock(item) : num;
    const safeQuantity = isKg ? Math.min(num, availableStock) : Math.min(num, availableStock);
    setCart(cart.map((cartItem) => {
      if (cartItem.id !== productId) return cartItem;
      let discountId = cartItem.discount_id;
      if (!discountId) {
        const autoDiscount = findAutoDiscount(cartItem);
        discountId = autoDiscount?.id || null;
      }
      return { ...cartItem, quantity: isKg ? parseFloat(safeQuantity.toFixed(3)) : safeQuantity, discount_id: discountId };
    }));
  };

  const handleApplyDiscount = (itemId, discountId) => {
    setCart(cart.map((item) =>
      item.id === itemId ? { ...item, discount_id: discountId === item.discount_id ? null : discountId } : item
    ));
  };

  const calculateItemDiscount = (item) => {
    if (!item.discount_id) return 0;
    const d = discounts.find((d) => d.id === item.discount_id);
    if (!d || !d.active) return 0;

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
        if (item.quantity >= d.buy_quantity && d.buy_quantity > 0) {
          const sets = Math.floor(item.quantity / d.buy_quantity);
          const freeItemsPerSet = d.buy_quantity - d.get_quantity;
          return sets * freeItemsPerSet * item.price;
        }
        return 0;
      case "fixed_bundle":
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

  const calculateTotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const calculateTotalDiscount = () => cart.reduce((sum, item) => sum + calculateItemDiscount(item), 0);

  const total = calculateTotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal = Math.max(total - totalDiscount - (parseFloat(manualDiscount) || 0), 0);

  const handleFinalizeSale = async () => {
    try {
      const currentCaixa = await apiFetch('/pos/cash-session/current');
      if (!currentCaixa) {
        setError('O caixa foi fechado. Não é possível vender.');
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
        calculated_discount: calculateItemDiscount(item),
      }));
      const payload = { items: saleItems, payment_method: selectedPayment };
      if (parseFloat(manualDiscount) > 0) {
        payload.manual_discount = parseFloat(manualDiscount);
        payload.approval_token = tempApprovalToken;
      }
      const response = await apiFetch('/sales', { method: 'POST', body: JSON.stringify(payload) });
      let documentNumber = response.document_number;
      if (!documentNumber && response.items && response.items.length > 0) {
        documentNumber = response.items[0].document_number;
      }
      setSuccessMessage(`Venda finalizada! Doc: ${documentNumber || response.id || 'OK'}`);
      setCart([]);
      setSearchTerm('');
      setSelectedPayment('cash');
      setManualDiscount('');
      setTempApprovalToken(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Erro ao finalizar venda: ' + err.message);
      setTimeout(() => setError(''), 3000);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleClearCart = () => {
    if (window.confirm('Limpar carrinho?')) setCart([]);
  };

  const handleExitFocusMode = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (err) { /* ignore */ }
    navigate('/caixa');
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') handleExitFocusMode();
      else if (e.key === 'F1') { e.preventDefault(); document.querySelector('.focus-search')?.focus(); }
      else if (e.key === 'F10') { e.preventDefault(); handleFinalizeSale(); }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [cart, selectedPayment, processingPayment]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="focus-loading">Carregando...</div>;

  return (
    <div className="caixa-focus-mode">
      {/* Header */}
      <div className="focus-header">
        <h1>MODO FOCO - FRENTE DE CAIXA</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={scale.connected ? scale.disconnect : scale.connect}
            style={{
              background: scale.connected ? '#10b981' : '#6b7280',
              color: 'white', border: 'none', borderRadius: '6px',
              padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
            }}
          >
            {scale.connected
              ? `Balança: ${scale.weight !== null ? `${scale.weight} kg` : 'Aguardando...'}`
              : 'Conectar Balança'}
          </button>
          <button className="exit-btn" onClick={handleExitFocusMode}>Sair do Modo Foco</button>
        </div>
      </div>

      {error && <div className="focus-error">{error}</div>}
      {successMessage && <div className="focus-success">{successMessage}</div>}

      {/* Modal de Pesagem */}
      {scaleModalProduct && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={() => setScaleModalProduct(null)}>
          <div style={{
            background: '#1e293b', borderRadius: '16px', padding: '32px',
            minWidth: '360px', color: 'white',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '8px' }}>Pesagem — {scaleModalProduct.name}</h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px' }}>
              R$ {Number(scaleModalProduct.price).toFixed(2)}/kg
            </p>
            {scale.connected ? (
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{
                  fontSize: '52px', fontWeight: 'bold', color: '#38bdf8',
                  background: 'rgba(56,189,248,0.1)', borderRadius: '12px', padding: '16px',
                }}>
                  {scale.weight !== null ? `${scale.weight.toFixed(3)} kg` : '---'}
                </div>
                {scale.weight !== null && (
                  <p style={{ color: '#4ade80', fontWeight: 'bold', marginTop: '8px' }}>
                    Total: R$ {(Number(scaleModalProduct.price) * scale.weight).toFixed(2)}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Peso (kg) — manual:</label>
                <input
                  type="number" step="0.001" min="0.001"
                  value={manualWeight}
                  onChange={(e) => setManualWeight(e.target.value)}
                  placeholder="Ex: 1.250"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmWeightAndAdd(); }}
                  style={{
                    width: '100%', padding: '12px', fontSize: '28px', textAlign: 'center',
                    border: '2px solid #38bdf8', borderRadius: '8px',
                    background: 'rgba(56,189,248,0.1)', color: 'white',
                  }}
                />
                {manualWeight && parseFloat(manualWeight) > 0 && (
                  <p style={{ color: '#4ade80', fontWeight: 'bold', marginTop: '8px', textAlign: 'center' }}>
                    Total: R$ {(Number(scaleModalProduct.price) * parseFloat(manualWeight)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={confirmWeightAndAdd}
                disabled={scale.connected ? (scale.weight === null || scale.weight <= 0) : (!manualWeight || parseFloat(manualWeight) <= 0)}
                style={{
                  flex: 1, padding: '12px', background: '#10b981', color: 'white',
                  border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
                }}
              >
                Confirmar Peso
              </button>
              <button
                onClick={() => { setScaleModalProduct(null); setError(''); }}
                style={{
                  padding: '12px 16px', background: '#475569', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="focus-content">
        {/* Área de Produtos */}
        <div className="focus-products">
          <input
            type="text"
            placeholder="Buscar produto (F1)..."
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
                  <div className="product-image">
                    <img src={product.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(product.name)}&background=random`} alt={product.name} />
                  </div>
                  <div className="product-name">
                    {product.name}
                    {isKgProduct(product) && <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.8 }}>⚖️</span>}
                  </div>
                  <div className="product-price">
                    R$ {formatCurrency(product.price)}{isKgProduct(product) ? '/kg' : ''}
                  </div>
                  <div className="product-stock">
                    {getProductStock(product) > 0
                      ? isKgProduct(product)
                        ? `Est: ${Number(product.current_stock).toFixed(3)} kg`
                        : `Est: ${getProductStock(product)}`
                      : 'Sem estoque'}
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
          <h2>CARRINHO ({cart.length})</h2>
          <div className="focus-cart-items">
            {cart.length === 0 ? (
              <p className="empty-cart">Carrinho vazio</p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="focus-cart-item">
                  <div className="item-info">
                    <div className="item-name">
                      {item.name}
                      {isKgProduct(item) && <span style={{ fontSize: '10px', marginLeft: '4px' }}>⚖️</span>}
                    </div>
                    <div className="item-price">
                      R$ {formatCurrency(item.price)}{isKgProduct(item) ? '/kg' : ''}
                    </div>
                    {item.discount_id && (
                      <div className="item-discount">-R$ {calculateItemDiscount(item).toFixed(2)}</div>
                    )}
                  </div>
                  <div className="item-controls">
                    {isKgProduct(item) ? (
                      <>
                        <input
                          type="number" step="0.001" min="0.001"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                          style={{ width: '70px', textAlign: 'center', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px' }}
                        />
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '2px' }}>kg</span>
                        <button
                          onClick={() => { setScaleModalProduct(item); setManualWeight(String(item.quantity)); }}
                          style={{ marginLeft: '4px', background: 'rgba(56,189,248,0.2)', border: '1px solid #38bdf8', borderRadius: '4px', color: '#38bdf8', cursor: 'pointer', padding: '2px 6px' }}
                        >
                          ⚖️
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleQuantityChange(item.id, item.quantity - 1)}>−</button>
                        <input
                          type="number"
                          value={item.quantity || 1}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        />
                        <button onClick={() => handleQuantityChange(item.id, item.quantity + 1)}>+</button>
                      </>
                    )}
                  </div>
                  <div className="item-total">
                    R$ {((item.price || 0) * (item.quantity || 0) - calculateItemDiscount(item)).toFixed(2)}
                    {isKgProduct(item) && (
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{Number(item.quantity).toFixed(3)} kg</div>
                    )}
                  </div>
                  <button className="item-remove" onClick={() => handleRemoveFromCart(item.id)}>✕</button>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && discounts.length > 0 && (
            <div className="focus-discounts">
              <label>Descontos Disponíveis:</label>
              <div className="discounts-list">
                {discounts.map((discount) => (
                  <button
                    key={discount.id}
                    className="discount-btn"
                    onClick={() => { if (cart.length > 0) handleApplyDiscount(cart[0].id, discount.id); }}
                  >
                    {discount.name} ({discount.value}{discount.type === 'percent' ? '%' : 'R$'})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="focus-cart-summary">
            <div className="summary-row"><span>Subtotal:</span><span>R$ {total.toFixed(2)}</span></div>
            {totalDiscount > 0 && (
              <div className="summary-row discount"><span>Desc. Auto:</span><span>-R$ {totalDiscount.toFixed(2)}</span></div>
            )}
            <div className="summary-row discount manual" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
              <span>Desc. Manual (R$):</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number" step="0.01" min="0"
                  value={manualDiscount}
                  onChange={(e) => setManualDiscount(e.target.value)}
                  onBlur={() => { if (parseFloat(manualDiscount) > 0 && !tempApprovalToken) setShowManualDiscountApproval(true); }}
                  placeholder="0.00"
                  style={{ width: '80px', textAlign: 'right', padding: '4px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid #444' }}
                />
                {tempApprovalToken && <span style={{ color: '#10b981' }}>Autorizado</span>}
              </div>
            </div>
            <div className="summary-row total"><span>TOTAL:</span><span>R$ {finalTotal.toFixed(2)}</span></div>
          </div>

          <div className="focus-payment">
            <label>Forma de Pagamento:</label>
            <select value={selectedPayment} onChange={(e) => setSelectedPayment(e.target.value)}>
              <option value="cash">Dinheiro</option>
              <option value="credit">Crédito</option>
              <option value="debit">Débito</option>
              <option value="pix">PIX</option>
            </select>
          </div>

          <div className="focus-actions">
            <button className="btn-clear" onClick={handleClearCart} disabled={cart.length === 0}>
              Limpar
            </button>
            <button
              className="btn-finalize"
              onClick={handleFinalizeSale}
              disabled={cart.length === 0 || processingPayment}
            >
              {processingPayment ? 'Processando...' : 'Finalizar (F10)'}
            </button>
          </div>
        </div>
      </div>

      <div className="focus-shortcuts">
        <span>F1: Busca | F10: Finalizar | ESC: Sair</span>
      </div>
    </div>
  );
}
