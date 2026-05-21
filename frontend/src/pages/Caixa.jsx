import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import { ApprovalModal } from "../components/ApprovalModal";
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
  const [selectedDiscount, setSelectedDiscount] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [manualDiscount, setManualDiscount] = useState("");
  const [showManualDiscountApproval, setShowManualDiscountApproval] = useState(false);
  const [tempApprovalToken, setTempApprovalToken] = useState(null);

  // Estado do Caixa
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [showAberturaModal, setShowAberturaModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");

  // Carregar produtos, descontos e status do caixa ao montar o componente
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        // Verificar se há caixa aberto
        const currentCaixa = await apiFetch("/pos/cash-session/current");
        if (currentCaixa) {
          setCaixaAberto(true);
        } else {
          setCaixaAberto(false);
          // setShowAberturaModal(true);
        }

        const promises = [apiFetch("/products")];
        
        // Todos os operadores precisam ver descontos para que sejam aplicados no caixa
        promises.push(apiFetch("/discounts"));

        const results = await Promise.allSettled(promises);
        
        if (results[0].status === 'fulfilled') {
          setProducts(results[0].value || []);
        } else {
          throw new Error(results[0].reason?.message || "Falha ao carregar produtos.");
        }

        if (results[1]?.status === 'fulfilled') {
          setDiscounts(results[1].value || []);
        }
      } catch (loadError) {
        setError(loadError.message || "Falha ao carregar dados.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Filtrar produtos pela busca
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Adicionar produto ao carrinho
  const addToCart = useCallback((product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      
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
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1, discount_id: item.discount_id || autoDiscount?.id || null }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, discount_id: autoDiscount?.id || null }];
    });
  }, [discounts]);

  // Remover item do carrinho
  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  // Atualizar quantidade do item
  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        
        // Ao atualizar quantidade, se não houver desconto selecionado, tenta buscar um automático
        let discountId = item.discount_id;
        if (!discountId) {
          const autoDiscount = discounts.find(d => {
            if (d.active !== 1 && d.active !== true) return false;
            if (d.target_type === 'all') return true;
            if (d.target_type === 'product') {
              try {
                const ids = JSON.parse(d.target_value || "[]");
                return ids.includes(item.id);
              } catch { return false; }
            }
            if (d.target_type === 'category') {
              return String(d.target_value) === String(item.category_id);
            }
            return false;
          });
          discountId = autoDiscount?.id || null;
        }

        return { ...item, quantity, discount_id: discountId };
      })
    );
  }, [removeFromCart, discounts]);

  // Aplicar desconto a um item
  const applyDiscountToItem = useCallback((productId, discountId) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, discount_id: discountId } : item
      )
    );
  }, []);

  // Calcular total do carrinho
  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => {
      const itemTotal = item.price * item.quantity;
      return sum + itemTotal;
    }, 0);
  };

  // Calcular desconto total
  const calculateTotalDiscount = () => {
    return cartItems.reduce((sum, item) => {
      if (!item.discount_id) return sum;
      const discount = discounts.find((d) => d.id === item.discount_id);
      if (!discount) return sum;

      const itemTotal = item.price * item.quantity;
      const quantity = item.quantity;
      let discountAmount = 0;

      if (discount.type === "percent") {
        discountAmount = itemTotal * (Number(discount.value) / 100);
      } else if (discount.type === "fixed") {
        discountAmount = Number(discount.value);
      } else if (discount.type === "buy_x_get_y") {
        const buyQty = Number(discount.buy_quantity);
        const getQty = Number(discount.get_quantity);
        if (buyQty > 0 && quantity >= buyQty) {
          discountAmount = Number(item.price) * getQty;
        }
      } else if (discount.type === "fixed_bundle") {
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

      return sum + Math.max(discountAmount, 0);
    }, 0);
  };

  const calculateTotalDiscountForItem = (item) => {
    if (!item.discount_id) return 0;
    const discount = discounts.find((d) => d.id === item.discount_id);
    if (!discount) return 0;

    const itemTotal = item.price * item.quantity;
    const quantity = item.quantity;
    let discountAmount = 0;

    if (discount.type === "percent") {
      discountAmount = itemTotal * (Number(discount.value) / 100);
    } else if (discount.type === "fixed") {
      discountAmount = Number(discount.value);
    } else if (discount.type === "buy_x_get_y") {
      const buyQty = Number(discount.buy_quantity);
      const getQty = Number(discount.get_quantity);
      if (buyQty > 0 && quantity >= buyQty) {
        discountAmount = Number(item.price) * getQty;
      }
    } else if (discount.type === "fixed_bundle") {
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

  const total = calculateTotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal = Math.max(total - totalDiscount - (parseFloat(manualDiscount) || 0), 0);

  // Lógica de Abertura de Caixa
  const handleOpenCaixaRequest = (e) => {
    e.preventDefault();
    if (!openingAmount || isNaN(openingAmount)) {
      setError("Informe um valor de abertura válido.");
      return;
    }
    setShowApprovalModal(true);
  };

  const handleAberturaAprovada = async (token) => {
    try {
      setLoading(true);
      setError("");
      await apiFetch("/pos/cash-session/open", {
        method: "POST",
        body: JSON.stringify({
          opening_amount: parseFloat(openingAmount),
          notes: openingNotes || "Abertura de caixa",
          approval_token: token
        })
      });
      setCaixaAberto(true);
      setShowAberturaModal(false);
      setShowApprovalModal(false);
      setSuccessMessage("Caixa aberto com sucesso!");
      
      // Recarregar status do caixa
      const currentCaixa = await apiFetch("/pos/cash-session/current");
      if (currentCaixa) setCaixaAberto(true);
      
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erro ao abrir caixa.");
      setShowApprovalModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Finalizar venda
  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      setError("Adicione itens ao carrinho antes de finalizar.");
      return;
    }

    setProcessingPayment(true);
    setError("");
    setSuccessMessage("");

    try {
      const saleItems = cartItems.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        discount_id: item.discount_id,
        calculated_discount: calculateTotalDiscountForItem(item)
      }));

      const payload = {
        items: saleItems,
        payment_method: paymentMethod,
      };

      if (parseFloat(manualDiscount) > 0) {
        payload.manual_discount = parseFloat(manualDiscount);
        payload.approval_token = tempApprovalToken;
      }

      const response = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Tratar resposta corretamente - pode ser multi-item ou single-item
      let documentNumber = response.document_number;
      if (!documentNumber && response.items && response.items.length > 0) {
        documentNumber = response.items[0].document_number;
      }
      
      setSuccessMessage(
        `Venda finalizada com sucesso! Documento: ${documentNumber || response.id || 'OK'}`
      );
      setCartItems([]);
      setPaymentMethod("cash");
      setManualDiscount("");
      setTempApprovalToken(null);

      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (checkoutError) {
      setError(checkoutError.message || "Erro ao finalizar venda.");
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <PageShell
      title="Frente de Caixa"
      subtitle="Ponto de Venda - Registre vendas em tempo real"
      actions={
        <div className="pos-actions">
          <button 
            className="btn-movimentacao" 
            onClick={() => navigate('/caixa/fechamento')}
          >
            💰 Movimentações / Fechar
          </button>
          <button 
            className="btn-focus-mode" 
            onClick={() => navigate('/caixa/focus')}
            title="Modo Foco - Tela Cheia"
          >
            🎯 Modo Foco
          </button>
        </div>
      }
    >
      {/* Modal de Abertura de Caixa */}
      {showAberturaModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Abertura de Caixa</h3>
            <p>Informe o valor inicial em dinheiro para começar as operações.</p>
            <form onSubmit={handleOpenCaixaRequest}>
              <div className="form-group">
                <label>Valor de Abertura (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0,00"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Observações (Opcional)</label>
                <textarea
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  placeholder="Ex: Fundo de caixa inicial"
                />
              </div>
                              <button type="button" className="button button-secondary" onClick={() => setShowAberturaModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-finalize" style={{ width: '100%' }}>
                Solicitar Abertura
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Aprovação do Superior */}
      {showApprovalModal && (
        <ApprovalModal
          action="open_cash_session"
          title="Autorização de Abertura"
          message={`O operador está solicitando a abertura do caixa com R$ ${parseFloat(openingAmount).toFixed(2)}. Um gerente deve autorizar.`}
          onApproved={handleAberturaAprovada}
          onCancel={() => setShowApprovalModal(false)}
        />
      )}

      {showManualDiscountApproval && (
        <ApprovalModal
          action="discount_override"
          title="Autorização de Desconto Manual"
          message={`O operador está solicitando um desconto manual de R$ ${parseFloat(manualDiscount).toFixed(2)}. Um gerente deve autorizar.`}
          onApproved={(token) => {
            setTempApprovalToken(token);
            setShowManualDiscountApproval(false);
            setSuccessMessage("Desconto manual autorizado!");
            setTimeout(() => setSuccessMessage(""), 3000);
          }}
          onCancel={() => {
            setShowManualDiscountApproval(false);
            setManualDiscount("");
          }}
        />
      )}

      <div className="pos-container">
        {/* Seção de Produtos */}
        <div className="pos-products">
                    <div className="search-section" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
              style={{ flex: 1 }}
            />
            {!caixaAberto && (
              <button 
                className="button button-primary" 
                onClick={() => setShowAberturaModal(true)}
                style={{ whiteSpace: 'nowrap', backgroundColor: '#10b981' }}
              >
                🔓 Abrir Caixa
              </button>
            )}
            {caixaAberto && (
              <span style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🟢 Caixa Aberto
              </span>
            )}
          </div>

          {loading && <p className="loading">Carregando produtos...</p>}
          {error && <p className="error-message">{error}</p>}

          <div className="products-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <div key={product.id} className="product-card">
                  <div className="product-info">
                    <h4>{product.name}</h4>
                    <p className="product-category">
                      {product.category_name || "Sem categoria"}
                    </p>
                    <p className="product-stock">
                      Estoque: {product.current_stock}
                    </p>
                    <p className="product-price">
                      R$ {Number(product.price).toFixed(2)}
                    </p>
                  </div>
                  <button
                    className="btn-add-cart"
                    onClick={() => addToCart(product)}
                    disabled={product.current_stock <= 0}
                  >
                    {product.current_stock > 0 ? "Adicionar" : "Sem estoque"}
                  </button>
                </div>
              ))
            ) : (
              <p className="no-products">Nenhum produto encontrado.</p>
            )}
          </div>
        </div>

        {/* Seção de Carrinho */}
        <div className="pos-cart">
          <h3>Carrinho</h3>

          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}

          {cartItems.length > 0 ? (
            <>
              <div className="cart-items">
                {cartItems.map((item) => (
                  <div key={item.id} className="cart-item">
                    <div className="item-details">
                      <h5>{item.name}</h5>
                      <p className="item-price">
                        R$ {Number(item.price).toFixed(2)}
                      </p>
                    </div>

                    <div className="item-quantity">
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(item.id, parseInt(e.target.value) || 1)
                        }
                        min="1"
                      />
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                      >
                        +
                      </button>
                    </div>

                        <div className="item-total" style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        R$ {((item.price * item.quantity) - (calculateTotalDiscountForItem(item))).toFixed(2)}
                      </div>
                      {calculateTotalDiscountForItem(item) > 0 && (
                        <div style={{ fontSize: '11px', color: '#ef4444', textDecoration: 'line-through' }}>
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </div>
                      )}
                      {discounts.length > 0 && (
                        <div className="item-discount-selector">
                          <select 
                            value={item.discount_id || ""} 
                            onChange={(e) => applyDiscountToItem(item.id, parseInt(e.target.value) || null)}
                            style={{ fontSize: '11px', marginTop: '4px', width: '100%' }}
                          >
                            <option value="">Sem desc. auto.</option>
                            {discounts.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      className="cart-item-remove"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-summary">
                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="summary-row discount">
                    <span>Descontos Automáticos:</span>
                    <span>-R$ {totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="summary-row discount manual" style={{ borderTop: '1px dashed #eee', paddingTop: '8px' }}>
                  <span>Desconto Manual (R$):</span>
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
                      style={{ width: '80px', textAlign: 'right', padding: '4px' }}
                    />
                    {tempApprovalToken && <span title="Autorizado" style={{ color: '#10b981' }}>✅</span>}
                  </div>
                </div>

                <div className="summary-row total">
                  <span>Total:</span>
                  <span>R$ {finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="payment-section">
                <label>Forma de Pagamento:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="payment-select"
                >
                  <option value="cash">Dinheiro</option>
                  <option value="credit">Cartão de Crédito</option>
                  <option value="debit">Cartão de Débito</option>
                  <option value="pix">PIX</option>
                </select>
              </div>

              <div className="cart-actions">
                <button
                  className="btn-finalize"
                  onClick={handleCheckout}
                  disabled={processingPayment || cartItems.length === 0}
                >
                  {processingPayment ? "Processando..." : "Finalizar Venda"}
                </button>

                <button
                  className="btn-clear"
                  onClick={() => setCartItems([])}
                >
                  Limpar Carrinho
                </button>
              </div>
            </>
          ) : (
            <p className="empty-cart">Carrinho vazio</p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
