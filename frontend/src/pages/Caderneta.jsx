import { useState, useEffect } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./Caderneta.css";

export function Caderneta() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState({ amount: "", method: "cash" });

  const loadCaderneta = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/caderneta");
      setCustomers(data || []);
    } catch (err) {
      console.error("Erro ao carregar caderneta:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (customer) => {
    setSelectedCustomer(customer);
    try {
      const data = await apiFetch(`/caderneta/${customer.id}/history`);
      setHistory(data || []);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/caderneta/pay", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          amount: parseFloat(paymentData.amount),
          payment_method: paymentData.method
        })
      });
      setShowPaymentModal(false);
      setPaymentData({ amount: "", method: "cash" });
      loadCaderneta();
      loadHistory(selectedCustomer);
    } catch (err) {
      alert("Erro ao processar pagamento: " + err.message);
    }
  };

  useEffect(() => {
    loadCaderneta();
  }, []);

  return (
    <PageShell title="Caderneta de Fiado" subtitle="Gerenciamento de débitos e pagamentos de clientes">
      <div className="caderneta-container">
        <div className="customers-list">
          <h3>Clientes com Débito</h3>
          {loading ? <p>Carregando...</p> : (
            <div className="customer-cards">
              {customers.map(c => (
                <div 
                  key={c.id} 
                  className={`customer-card ${selectedCustomer?.id === c.id ? 'active' : ''}`}
                  onClick={() => loadHistory(c)}
                >
                  <div className="customer-info">
                    <h4>{c.name}</h4>
                    <p>{c.phone || "Sem telefone"}</p>
                  </div>
                  <div className="customer-debt">
                    <span style={{ fontSize: '10px', display: 'block', opacity: 0.7 }}>Dívida Atual</span>
                    R$ {Number(c.current_debt).toFixed(2)}
                  </div>
                </div>
              ))}
              {customers.length === 0 && <p className="no-data">Nenhum débito pendente.</p>}
            </div>
          )}
        </div>

        <div className="customer-details">
          {selectedCustomer ? (
            <>
              <div className="details-header">
                <div className="header-info">
                  <h3>{selectedCustomer.name}</h3>
                  <div className="debt-summary">
                    <div className="summary-item">
                      <label>Saldo Devedor</label>
                      <strong style={{ color: 'var(--accent-danger)' }}>R$ {Number(selectedCustomer.current_debt).toFixed(2)}</strong>
                    </div>
                    <div className="summary-item">
                      <label>Limite de Crédito</label>
                      <strong>R$ {Number(selectedCustomer.credit_limit).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
                <button className="btn-pay" onClick={() => setShowPaymentModal(true)}>Registrar Pagamento</button>
              </div>
              
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => (
                      <tr key={idx} className={h.type}>
                        <td>{new Date(h.created_at).toLocaleString()}</td>
                        <td><span className={`badge ${h.type}`}>{h.type.toUpperCase()}</span></td>
                        <td>{h.items}</td>
                        <td>{h.type === 'venda' ? '-' : '+'} R$ {Number(h.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="select-prompt">Selecione um cliente para ver o histórico</div>
          )}
        </div>
      </div>

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Registrar Pagamento</h3>
            <p>Cliente: {selectedCustomer.name}</p>
            <form onSubmit={handlePayment}>
              <div className="form-group">
                <label>Valor do Pagamento (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={paymentData.amount} 
                  onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                  placeholder="0,00"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Método de Pagamento</label>
                <select 
                  value={paymentData.method} 
                  onChange={e => setPaymentData({...paymentData, method: e.target.value})}
                >
                  <option value="cash">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="card">Cartão</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-finalize">Confirmar Pagamento</button>
                <button type="button" className="button button-secondary" onClick={() => setShowPaymentModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
