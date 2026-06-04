import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { ApprovalModal } from './ApprovalModal';
import { X, Trash2, Calendar, ShoppingBag, CreditCard } from 'lucide-react';
import './SalesHistoryModal.css';

export function SalesHistoryModal({ onClose }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showApproval, setShowApproval] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const loadSales = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await apiFetch(`/sales/recent?start=${today}&end=${today}`);
      setSales(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar vendas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const handleDeleteClick = (id) => {
    setPendingDeleteId(id);
    setShowApproval(true);
  };

  const handleConfirmDelete = async (token) => {
    try {
      await apiFetch(`/sales/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: { 'X-Approval-Token': token }
      });
      setShowApproval(false);
      setPendingDeleteId(null);
      loadSales();
    } catch (err) {
      alert('Erro ao excluir venda: ' + err.message);
    }
  };

  return (
    <div className="sales-history-overlay">
      <div className="sales-history-modal">
        <div className="sales-history-header">
          <div className="header-title">
            <ShoppingBag size={24} />
            <h2>Vendas do Dia</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="sales-history-content">
          {loading ? (
            <div className="loading-state">Carregando vendas...</div>
          ) : sales.length === 0 ? (
            <div className="empty-state">Nenhuma venda realizada hoje.</div>
          ) : (
            <div className="sales-list">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Total</th>
                    <th>Pagamento</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.created_at).toLocaleTimeString('pt-BR')}</td>
                      <td>{sale.product_name}</td>
                      <td>{sale.quantity}</td>
                      <td>R$ {Number(sale.final_total).toFixed(2)}</td>
                      <td>
                        <span className={`payment-badge ${sale.payment_method}`}>
                          {sale.payment_method.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="delete-sale-btn"
                          onClick={() => handleDeleteClick(sale.id)}
                          title="Excluir Venda"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sales-history-footer">
          <div className="summary-info">
            <span>Total de Vendas: {sales.length}</span>
            <span>Total Valor: R$ {sales.reduce((acc, s) => acc + Number(s.final_total), 0).toFixed(2)}</span>
          </div>
          <button className="btn-done" onClick={onClose}>Fechar</button>
        </div>
      </div>

      {showApproval && (
        <ApprovalModal
          title="Autorização de Cancelamento"
          message="Esta ação irá estornar o estoque e excluir o registro da venda. Requer senha de supervisor."
          action="delete_sale"
          onApproved={handleConfirmDelete}
          onCancel={() => setShowApproval(false)}
        />
      )}
    </div>
  );
}
