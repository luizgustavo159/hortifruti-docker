import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
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

  // Carregar produtos e descontos ao montar o componente
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const promises = [apiFetch("/products")];
        
        // Apenas gerentes e acima podem ver descontos
        const user = JSON.parse(sessionStorage.getItem('greenstore_user') || '{}');
        const canSeeDiscounts = ['manager', 'admin'].includes(user.role);
        
        if (canSeeDiscounts) {
          promises.push(apiFetch("/discounts"));
        }

        const results = await Promise.allSettled(promises);
        
        if (results[0].status === 'fulfilled') {
          setProducts(results[0].value || []);
        } else {
          throw new Error(results[0].reason?.message || "Falha ao carregar produtos.");
        }

        if (canSeeDiscounts && results[1]?.status === 'fulfilled') {
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
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, discount_id: null }];
    });
  }, []);

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
      prev.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  }, [removeFromCart]);

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
      let discountAmount = 0;

      if (discount.type === "percent") {
        discountAmount = itemTotal * (discount.value / 100);
      } else if (discount.type === "fixed") {
        discountAmount = Math.min(discount.value, itemTotal);
      }

      return sum + discountAmount;
    }, 0);
  };

  const total = calculateTotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal = total - totalDiscount;

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
      }));

      const response = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: saleItems,
          payment_method: paymentMethod,
        }),
      });

      setSuccessMessage(
        `Venda finalizada com sucesso! Documento: ${response.document_number || response.id}`
      );
      setCartItems([]);
      setPaymentMethod("cash");

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
        <button 
          className="btn-focus-mode" 
          onClick={() => navigate('/caixa/focus')}
          title="Modo Foco - Tela Cheia"
        >
          🎯 Modo Foco
        </button>
      }
    >
      <div className="pos-container">
        {/* Seção de Produtos */}
        <div className="pos-products">
          <div className="search-section">
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
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

                        <div className="item-total">
                      R$ {(item.price * item.quantity).toFixed(2)}
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
                    <span>Desconto:</span>
                    <span>-R$ {totalDiscount.toFixed(2)}</span>
                  </div>
                )}
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
