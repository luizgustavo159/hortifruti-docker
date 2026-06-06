import { useRef } from 'react';
import './CupomFiscal.css';

export function CupomFiscal({ sale, lojaInfo }) {
  const cupomRef = useRef(null);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=400');
    printWindow.document.write(cupomRef.current.innerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  return (
    <div className="cupom-container">
      <div ref={cupomRef} className="cupom-fiscal">
        {/* Cabeçalho */}
        <div className="cupom-header">
          <h1>{lojaInfo?.name || 'GreenStore'}</h1>
          <p className="cnpj">CNPJ: {lojaInfo?.cnpj || '00.000.000/0000-00'}</p>
          <p className="endereco">
            {lojaInfo?.address || 'Endereço não configurado'}
          </p>
          <p className="contato">{lojaInfo?.phone || ''}</p>
        </div>

        {/* Separador */}
        <div className="cupom-separator">
          ═══════════════════════════════════
        </div>

        {/* Informações da Venda */}
        <div className="cupom-info">
          <p>
            <span>Data:</span>
            <span>{formatDate(sale.created_at)}</span>
          </p>
          <p>
            <span>Cupom:</span>
            <span>#{sale.id}</span>
          </p>
          <p>
            <span>Operador:</span>
            <span>{sale.operator_name || 'Sistema'}</span>
          </p>
        </div>

        {/* Separador */}
        <div className="cupom-separator">
          ═══════════════════════════════════
        </div>

        {/* Itens */}
        <div className="cupom-items">
          <div className="cupom-item-header">
            <span className="item-desc">Descrição</span>
            <span className="item-qty">Qtd</span>
            <span className="item-price">Preço</span>
            <span className="item-total">Total</span>
          </div>
          <div className="cupom-separator-light">
            ───────────────────────────────────
          </div>

          {sale.items?.map((item, idx) => (
            <div key={idx} className="cupom-item">
              <div className="item-row">
                <span className="item-desc">{item.product_name}</span>
                <span className="item-qty">{item.quantity}</span>
                <span className="item-price">R$ {item.price.toFixed(2)}</span>
                <span className="item-total">
                  R$ {(item.quantity * item.price).toFixed(2)}
                </span>
              </div>
              {item.discount_amount > 0 && (
                <div className="item-discount">
                  <span>Desconto:</span>
                  <span>-R$ {item.discount_amount.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Separador */}
        <div className="cupom-separator">
          ═══════════════════════════════════
        </div>

        {/* Totais */}
        <div className="cupom-totals">
          <div className="cupom-total-row">
            <span>Subtotal:</span>
            <span>
              R${' '}
              {(
                (sale.total || 0) + (sale.discount_amount || 0)
              ).toFixed(2)}
            </span>
          </div>
          {sale.discount_amount > 0 && (
            <div className="cupom-total-row discount">
              <span>Desconto Total:</span>
              <span>-R$ {sale.discount_amount.toFixed(2)}</span>
            </div>
          )}
          <div className="cupom-total-row final">
            <span>TOTAL:</span>
            <span>R$ {(sale.total || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Separador */}
        <div className="cupom-separator">
          ═══════════════════════════════════
        </div>

        {/* Forma de Pagamento */}
        <div className="cupom-payment">
          <p>
            <span>Forma de Pagamento:</span>
            <span className="payment-method">
              {sale.payment_method === 'cash' && 'Dinheiro'}
              {sale.payment_method === 'credit_card' && 'Cartão de Crédito'}
              {sale.payment_method === 'debit_card' && 'Cartão de Débito'}
              {sale.payment_method === 'card' && 'Cartão'}
              {sale.payment_method === 'pix' && 'PIX'}
              {sale.payment_method === 'fiado' && 'Fiado (Caderneta)'}
            </span>
          </p>
        </div>

        {/* Rodapé */}
        <div className="cupom-footer">
          <p>Obrigado pela compra!</p>
          <p className="cupom-number">Cupom #{sale.id}</p>
          <p className="cupom-time">{formatDate(sale.created_at)}</p>
          <div className="cupom-separator-light">
            ───────────────────────────────────
          </div>
          <p className="cupom-message">
            Volte sempre! 🍎
          </p>
        </div>
      </div>

      {/* Botão de Impressão */}
      <button className="btn-print" onClick={handlePrint}>
        🖨️ Imprimir Cupom
      </button>
    </div>
  );
}
