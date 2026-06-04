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
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [paymentData, setPaymentData] = useState({ amount: "", method: "cash" });
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "", credit_limit: 100 });

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
    if (e) e.preventDefault();
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
      if (selectedCustomer) loadHistory(selectedCustomer);
    } catch (err) {
      alert("Erro ao processar pagamento: " + err.message);
    }
  };

  const handleCreateCustomer = async (e) => {
    if (e) e.preventDefault();
    try {
      await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          ...newCustomer,
          name: newCustomer.name.toUpperCase()
        })
      });
      setShowCustomerModal(false);
      setNewCustomer({ name: "", phone: "", address: "", credit_limit: 100 });
      loadCaderneta();
    } catch (err) {
      alert("Erro ao cadastrar cliente: " + err.message);
    }
  };

  useEffect(() => {
    loadCaderneta();
  }, []);

  return (
    <PageShell 
      title="Caderneta de Fiado" 
      subtitle="Gerenciamento de débitos e pagamentos de clientes"
      actions={<button className="btn-new-customer" onClick={() => setShowCustomerModal(true)}>+ Novo Cliente</button>}
    >
      <div className="caderneta-container">
        <div className="customers-list">
          <div className="list-header">
            <h3>Clientes Cadastrados</h3>
          </div>
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
                    <span className="debt-label">Dívida</span>
                    R$ {Number(c.current_debt || 0).toFixed(2)}
                  </div>
                </div>
              ))}
              {customers.length === 0 && <p className="no-data">Nenhum cliente encontrado.</p>}
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
                      <strong className="debt-value">R$ {Number(selectedCustomer.current_debt || 0).toFixed(2)}</strong>
                    </div>
                    <div className="summary-item">
                      <label>Limite de Crédito</label>
                      <strong>R$ {Number(selectedCustomer.credit_limit || 0).toFixed(2)}</strong>
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
                    {history.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>Nenhuma movimentação encontrada.</td></tr>}
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
          <div className="modal">
            <h2>Registrar Pagamento</h2>
            <div className="modal-body">
              <p className="modal-subtitle">Cliente: <strong>{selectedCustomer.name}</strong></p>
              <div className="form-group">
                <label>Valor do Pagamento (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={paymentData.amount} 
                  onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                  placeholder="0,00"
                  className="input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Método de Pagamento</label>
                <select 
                  value={paymentData.method} 
                  onChange={e => setPaymentData({...paymentData, method: e.target.value})}
                  className="input"
                >
                  <option value="cash">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="card">Cartão</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handlePayment}>Confirmar Pagamento</button>
              <button className="btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Novo Cliente na Caderneta</h2>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome do Cliente</label>
                <input 
                  type="text" 
                  value={newCustomer.name} 
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="NOME COMPLETO"
                  className="input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input 
                  type="text" 
                  value={newCustomer.phone} 
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  placeholder="(00) 00000-0000"
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>Endereço</label>
                <input 
                  type="text" 
                  value={newCustomer.address} 
                  onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                  placeholder="RUA, NÚMERO, BAIRRO..."
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>Limite de Crédito (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={newCustomer.credit_limit} 
                  onChange={e => setNewCustomer({...newCustomer, credit_limit: e.target.value})}
                  placeholder="100,00"
                  className="input"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreateCustomer}>Cadastrar Cliente</button>
              <button className="btn-secondary" onClick={() => setShowCustomerModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
