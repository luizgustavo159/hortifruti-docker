import { useState } from 'react';
import { apiFetch } from '../lib/api';
import './ApprovalModal.css';

export function ApprovalModal({ action, onApproved, onCancel, title, message }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleApprove = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/approvals', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          action,
          reason: 'Aprovação de superior para operação de caixa'
        })
      });

      if (response.token) {
        onApproved(response.token);
      } else {
        throw new Error('Falha ao obter token de aprovação');
      }
    } catch (err) {
      setError(err.message || 'Credenciais inválidas ou sem permissão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{title || 'Aprovação Necessária'}</h3>
        <p>{message || 'Esta operação requer autorização de um gerente ou administrador.'}</p>
        
        <form onSubmit={handleApprove}>
          <div className="form-group">
            <label>Email ou Usuário do Superior</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ex: admin ou admin@empresa.com"
            />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCancel} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-approve" disabled={loading}>
              {loading ? 'Validando...' : 'Autorizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
