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

  // Estado do Caixa
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [showAberturaModal, setShowAberturaModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");

  // Balança
  const scale = useScale();
  const [scaleModalProduct, setScaleModalProduct] = useState(null); // produto aguardando peso
  const [manualWeight, setManualWeight] = useState("");              // peso digitado manualmente

  // Carregar produtos, descontos e status do caixa ao montar o componente
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const currentCaixa = await apiFetch("/pos/cash-session/current");
        if (currentCaixa) {
          setCaixaAberto(true);
        } else {
          setCaixaAberto(false);
        }

        const promises = [apiFetch("/products")];
        promises.push(apiFetch("/discounts"));

        const results = await Promise.allSettled(promises);

        if (results[0].status === "fulfilled") {
          setProducts(results[0].value || []);
        } else {
          throw new Error(results[0].reason?.message || "Falha ao carregar produtos.");
        }

        if (results[1]?.status === "fulfilled") {
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

  // Detecta se produto é vendido por peso
  const isKgProduct = (product) => product?.unit_type === "kg";

  // Encontrar desconto automático para um produto
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

  // Adicionar produto ao carrinho
  // Para produtos por kg: abre modal de pesagem
  // Para produtos por unidade: adiciona diretamente
  const addToCart = useCallback((product) => {
    if (isKgProduct(product)) {
      // Abre modal de pesagem
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
  }, [discounts, scale.weight, findAutoDiscount]);

  // Confirmar pesagem e adicionar produto por kg ao carrinho
  const confirmWeightAndAdd = useCallback(() => {
    if (!scaleModalProduct) return;

    const weightValue = parseFloat(
      (scale.connected && scale.weight !== null ? scale.weight : manualWeight)
        ?.toString()
        .replace(",", ".")
    );

    if (isNaN(weightValue) || weightValue <= 0) {
      setError("Informe um peso válido (maior que zero).");
      return;
    }

    const product = scaleModalProduct;
    const autoDiscount = findAutoDiscount(product);

    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        // Acumula peso
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

  // Remover item do carrinho
  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  // Atualizar quantidade/peso do item
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
        let discountId = item.discount_id;
        if (!discountId) {
          const autoDiscount = findAutoDiscount(item);
          discountId = autoDiscount?.id || null;
        }
        return { ...item, quantity: isKg ? parseFloat(parsed.toFixed(3)) : parsed, discount_id: discountId };
      })
    );
  }, [removeFromCart, findAutoDiscount, products]);

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

  // Calcular desconto de um item
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

  const calculateTotalDiscount = () => {
    return cartItems.reduce((sum, item) => sum + calculateTotalDiscountForItem(item), 0);
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
          approval_token: token,
        }),
      });
      setCaixaAberto(true);
      setShowAberturaModal(false);
      setShowApprovalModal(false);
      setSuccessMessage("Caixa aberto com sucesso!");

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
    if (!caixaAberto) {
      setError("O caixa está fechado. Abra o caixa para realizar vendas.");
      return;
    }

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
        calculated_discount: calculateTotalDiscountForItem(item),
      }));

      const payload = {
        items: saleItems,
        payment_method: paymentMethod,
      };

      if (paymentMethod === "cash" && amountReceived) {
        payload.amount_received = parseFloat(amountReceived);
        payload.change_amount = Math.max(parseFloat(amountReceived) - finalTotal, 0);
      }

      if (parseFloat(manualDiscount) > 0) {
        payload.manual_discount = parseFloat(manualDiscount);
        payload.approval_token = tempApprovalToken;
      }

      const response = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let documentNumber = response.document_number;
      if (!documentNumber && response.items && response.items.length > 0) {
        documentNumber = response.items[0].document_number;
      }

      setSuccessMessage(
        `Venda finalizada com sucesso! Documento: ${documentNumber || response.id || "OK"}`
      );
      setCartItems([]);
      setPaymentMethod("cash");
      setManualDiscount("");
      setAmountReceived("");
      setTempApprovalToken(null);

      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (checkoutError) {
      setError(checkoutError.message || "Erro ao finalizar venda.");
    } finally {
      setProcessingPayment(false);
    }
  };

  // Formatar exibição de quantidade no carrinho
  const formatQuantity = (item) => {
    if (isKgProduct(item)) {
      return `${Number(item.quantity).toFixed(3)} kg`;
    }
    return item.quantity;
  };

  return (
    <PageShell
      title="Frente de Caixa"
      subtitle="Ponto de Venda - Registre vendas em tempo real"
      actions={
        <div className="pos-actions">
          {/* Botão de balança */}
          <button
            className={`btn-scale ${scale.connected ? "connected" : ""}`}
            onClick={scale.connected ? scale.disconnect : scale.connect}
            title={scale.connected ? "Desconectar balança" : "Conectar balança serial"}
            style={{
              background: scale.connected ? "#10b981" : "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
            }}
          >
            ⚖️ {scale.connected ? `Balança: ${scale.weight !== null ? `${scale.weight} kg` : "Aguardando..."}` : "Conectar Balança"}
          </button>

          <button
            className="btn-movimentacao"
            onClick={() => navigate("/caixa/fechamento")}
          >
            💰 Movimentações / Fechar
          </button>
          <button
            className="btn-focus-mode"
            onClick={() => {
              if (!caixaAberto) {
                setError("O Modo Foco só pode ser aberto se o caixa estiver aberto.");
                return;
              }
              navigate("/caixa/focus");
            }}
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
              <button type="submit" className="btn-finalize" style={{ width: "100%" }}>
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

      {/* Modal de Pesagem — aparece ao clicar em produto por kg */}
      {scaleModalProduct && (
        <div className="modal-overlay" onClick={() => setScaleModalProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3>⚖️ Pesagem — {scaleModalProduct.name}</h3>
            <p style={{ color: "#6b7280", marginBottom: "16px" }}>
              Preço: <strong>R$ {Number(scaleModalProduct.price).toFixed(2)}/kg</strong>
            </p>

            {scale.connected ? (
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{
                  fontSize: "48px",
                  fontWeight: "bold",
                  color: "#1d4ed8",
                  background: "#eff6ff",
                  borderRadius: "12px",
                  padding: "16px",
                  letterSpacing: "2px",
                }}>
                  {scale.weight !== null ? `${scale.weight.toFixed(3)} kg` : "---"}
                </div>
                <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "8px" }}>
                  Leitura em tempo real da balança
                </p>
                {scale.weight !== null && (
                  <p style={{ color: "#16a34a", fontWeight: "bold", marginTop: "4px" }}>
                    Total: R$ {(Number(scaleModalProduct.price) * scale.weight).toFixed(2)}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
                  Peso (kg) — entrada manual:
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={manualWeight}
                  onChange={(e) => setManualWeight(e.target.value)}
                  placeholder="Ex: 1.250"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "24px",
                    textAlign: "center",
                    border: "2px solid #3b82f6",
                    borderRadius: "8px",
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmWeightAndAdd(); }}
                />
                {manualWeight && parseFloat(manualWeight) > 0 && (
                  <p style={{ color: "#16a34a", fontWeight: "bold", marginTop: "8px", textAlign: "center" }}>
                    Total: R$ {(Number(scaleModalProduct.price) * parseFloat(manualWeight)).toFixed(2)}
                  </p>
                )}
                <p style={{ color: "#9ca3af", fontSize: "12px", marginTop: "8px" }}>
                  Dica: conecte a balança pelo botão "⚖️ Conectar Balança" para leitura automática.
                </p>
              </div>
            )}

            {error && <p style={{ color: "#dc2626", marginBottom: "12px" }}>{error}</p>}

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn-finalize"
                style={{ flex: 1 }}
                onClick={confirmWeightAndAdd}
                disabled={
                  scale.connected
                    ? scale.weight === null || scale.weight <= 0
                    : !manualWeight || parseFloat(manualWeight) <= 0
                }
              >
                ✓ Confirmar Peso e Adicionar
              </button>
              <button
                className="button button-secondary"
                onClick={() => { setScaleModalProduct(null); setError(""); }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pos-container">
        {/* Seção de Produtos */}
        <div className="pos-products">
          <div className="search-section" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
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
                style={{ whiteSpace: "nowrap", backgroundColor: "#10b981" }}
              >
                🔓 Abrir Caixa
              </button>
            )}
            {caixaAberto && (
              <span style={{ color: "#10b981", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                🟢 Caixa Aberto
              </span>
            )}
          </div>

          {loading && <p className="loading">Carregando produtos...</p>}
          {error && !scaleModalProduct && <p className="error-message">{error}</p>}

          <div className="products-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <div key={product.id} className={`product-card ${isKgProduct(product) ? "product-card-kg" : ""}`}>
                  <div className="product-info">
                    <h4>
                      {product.name}
                      {isKgProduct(product) && (
                        <span style={{
                          marginLeft: "6px",
                          fontSize: "10px",
                          background: "#dbeafe",
                          color: "#1d4ed8",
                          padding: "1px 6px",
                          borderRadius: "10px",
                          verticalAlign: "middle",
                        }}>
                          ⚖️ kg
                        </span>
                      )}
                    </h4>
                    <p className="product-category">
                      {product.category_name || "Sem categoria"}
                    </p>
                    <p className="product-stock">
                      {isKgProduct(product)
                        ? `Estoque: ${Number(product.current_stock).toFixed(3)} kg`
                        : `Estoque: ${product.current_stock}`}
                    </p>
                    <p className="product-price">
                      R$ {Number(product.price).toFixed(2)}{isKgProduct(product) ? "/kg" : ""}
                    </p>
                  </div>
                  <button
                    className="btn-add-cart"
                    onClick={() => addToCart(product)}
                    disabled={Number(product.current_stock) <= 0}
                  >
                    {Number(product.current_stock) > 0
                      ? isKgProduct(product) ? "⚖️ Pesar" : "Adicionar"
                      : "Sem estoque"}
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
                      <h5>
                        {item.name}
                        {isKgProduct(item) && (
                          <span style={{ marginLeft: "4px", fontSize: "10px", color: "#1d4ed8" }}>⚖️</span>
                        )}
                      </h5>
                      <p className="item-price">
                        R$ {Number(item.price).toFixed(2)}{isKgProduct(item) ? "/kg" : ""}
                      </p>
                    </div>

                    <div className="item-quantity">
                      {isKgProduct(item) ? (
                        // Produto por kg: input decimal + botão de re-pesagem
                        <>
                          <input
                            type="number"
                            value={item.quantity}
                            step="0.001"
                            min="0.001"
                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                            style={{ width: "80px", textAlign: "center" }}
                          />
                          <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "4px" }}>kg</span>
                          <button
                            title="Re-pesar"
                            onClick={() => {
                              setScaleModalProduct(item);
                              setManualWeight(String(item.quantity));
                            }}
                            style={{
                              marginLeft: "4px",
                              background: "#eff6ff",
                              border: "1px solid #3b82f6",
                              borderRadius: "4px",
                              cursor: "pointer",
                              padding: "2px 6px",
                              fontSize: "14px",
                            }}
                          >
                            ⚖️
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                            min="1"
                          />
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                        </>
                      )}
                    </div>

                    <div className="item-total" style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                        R$ {((item.price * item.quantity) - calculateTotalDiscountForItem(item)).toFixed(2)}
                      </div>
                      {calculateTotalDiscountForItem(item) > 0 && (
                        <div style={{ fontSize: "11px", color: "#ef4444", textDecoration: "line-through" }}>
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </div>
                      )}
                      {isKgProduct(item) && (
                        <div style={{ fontSize: "11px", color: "#6b7280" }}>
                          {formatQuantity(item)}
                        </div>
                      )}
                      {discounts.length > 0 && (
                        <div className="item-discount-selector">
                          <select
                            value={item.discount_id || ""}
                            onChange={(e) => applyDiscountToItem(item.id, parseInt(e.target.value) || null)}
                            style={{ fontSize: "11px", marginTop: "4px", width: "100%" }}
                          >
                            <option value="">Sem desc. auto.</option>
                            {discounts.map((d) => (
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

                <div className="summary-row discount manual" style={{ borderTop: "1px dashed #eee", paddingTop: "8px" }}>
                  <span>Desconto Manual (R$):</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
                      style={{ width: "80px", textAlign: "right", padding: "4px" }}
                    />
                    {tempApprovalToken && <span title="Autorizado" style={{ color: "#10b981" }}>✅</span>}
                  </div>
                </div>

                <div className="summary-row total">
                  <span>Total:</span>
                  <span>R$ {finalTotal.toFixed(2)}</span>
                </div>
                
                {paymentMethod === "cash" && (
                  <div className="change-calculator" style={{ borderTop: "2px solid #3b82f6", marginTop: "12px", paddingTop: "12px" }}>
                    <div className="summary-row">
                      <span style={{ fontWeight: "bold" }}>Valor Recebido:</span>
                      <input
                        type="number"
                        step="0.01"
                        min={finalTotal}
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                        style={{ width: "100px", textAlign: "right", padding: "6px", fontSize: "16px", border: "2px solid #3b82f6", borderRadius: "4px" }}
                        autoFocus={paymentMethod === "cash"}
                      />
                    </div>
                    {parseFloat(amountReceived) >= finalTotal && (
                      <div className="summary-row" style={{ marginTop: "8px", color: "#10b981", fontSize: "18px", fontWeight: "bold" }}>
                        <span>Troco:</span>
                        <span>R$ {(parseFloat(amountReceived) - finalTotal).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
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
