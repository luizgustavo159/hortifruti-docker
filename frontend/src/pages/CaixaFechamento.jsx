import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '../components/PageShell';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';
import './CaixaFechamento.css';

export function CaixaFechamento() {
  const [caixaData, setCaixaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState([]);
  const [totalExpected, setTotalExpected] = useState(0);
  const [totalCounted, setTotalCounted] = useState(0);
  const [difference, setDifference] = useState(0);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Carregar dados de caixa
  useEffect(() => {
    const loadCaixaData = async () => {
      try {
        setLoading(true);
        const [caixa, movs] = await Promise.all([
          apiFetch('/pos/cash-session/current'),
          apiFetch('/pos/cash-session/movement?limit=50'),
        ]);
        
        if (caixa) {
          setCaixaData(caixa);
          // No backend o campo é expected_amount
          setTotalExpected(parseFloat(caixa.expected_amount || caixa.opening_amount || 0));
        }
        
        setMovements(movs.data || []);
      } catch (error) {
        console.error(error);
        toast.error('Erro ao carregar dados de caixa');
      } finally {
        setLoading(false);
      }
    };
    loadCaixaData();
  }, []);

  // Calcular diferença
  useEffect(() => {
    const diff = totalCounted - totalExpected;
    setDifference(diff);
  }, [totalCounted, totalExpected]);

  // Registrar movimentação
  const addMovement = useCallback(async (type, amount) => {
    if (!amount || isNaN(amount)) return;
    
    try {
      const response = await apiFetch('/pos/cash-session/movement', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amount: parseFloat(amount),
          reason: `${type === 'withdrawal' ? 'Sangria' : 'Suprimento'} manual`,
        }),
      });
      toast.success(`${type === 'withdrawal' ? 'Sangria' : 'Suprimento'} registrado com sucesso!`);
      setMovements(prev => [response, ...prev]);
      
      // Recarregar valor esperado após movimentação
      const updatedCaixa = await apiFetch('/pos/cash-session/current');
      if (updatedCaixa) {
        setTotalExpected(parseFloat(updatedCaixa.expected_amount || updatedCaixa.opening_amount || 0));
      }
    } catch (error) {
      toast.error('Erro ao registrar movimentação: ' + error.message);
    }
  }, []);

  // Fechar caixa
  const handleCloseCaixa = async () => {
    if (totalCounted === 0 && !window.confirm('Deseja fechar o caixa com valor zero?')) {
      return;
    }

    setProcessing(true);
    try {
      await apiFetch('/pos/cash-session/close', {
        method: 'POST',
        body: JSON.stringify({
          closing_amount: totalCounted, // Corrigido para contrato do backend
          notes,
        }),
      });
      toast.success('Caixa fechado com sucesso!');
      setTimeout(() => {
        window.location.href = '/caixa';
      }, 1500);
    } catch (error) {
      toast.error('Erro ao fechar caixa: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <PageShell title="Fechamento de Caixa"><div className="loading">Carregando...</div></PageShell>;
  }

  if (!caixaData) {
    return (
      <PageShell title="Fechamento de Caixa">
        <div className="empty-state">
          <p>Não há nenhum caixa aberto no momento.</p>
          <button className="button" onClick={() => window.location.href = '/caixa'}>Voltar ao PDV</button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Fechamento de Caixa"
      subtitle={`Operador: ${caixaData.operator_name || 'Atual'}`}
    >
      <div className="caixa-fechamento-container">
        {/* Resumo */}
        <div className="resumo-section">
          <div className="resumo-card">
            <h3>Valor Esperado</h3>
            <p className="valor">R$ {totalExpected.toFixed(2)}</p>
          </div>
          <div className="resumo-card">
            <h3>Valor Contado</h3>
            <input
              type="number"
              value={totalCounted}
              onChange={(e) => setTotalCounted(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="valor-input"
              step="0.01"
            />
          </div>
          <div className={`resumo-card ${Math.abs(difference) < 0.01 ? 'balanced' : difference > 0 ? 'surplus' : 'deficit'}`}>
            <h3>Diferença</h3>
            <p className="valor">R$ {difference.toFixed(2)}</p>
            <p className="status">
              {Math.abs(difference) < 0.01 && '✓ Caixa Balanceado'}
              {difference > 0.01 && '↑ Sobra'}
              {difference < -0.01 && '↓ Falta'}
            </p>
          </div>
        </div>

        {/* Movimentações */}
        <div className="movimentos-section">
          <h3>Movimentações da Sessão</h3>
          <div className="movimento-buttons">
            <button
              className="btn-movimento btn-sangria"
              onClick={() => addMovement('withdrawal', prompt('Valor da sangria (R$):'))}
            >
              💰 Sangria
            </button>
            <button
              className="btn-movimento btn-suprimento"
              onClick={() => addMovement('supply', prompt('Valor do suprimento (R$):'))}
            >
              ➕ Suprimento
            </button>
          </div>

          <div className="movimentos-list">
            {movements.length === 0 ? (
              <p className="empty-mov">Nenhuma movimentação manual registrada.</p>
            ) : (
              movements.map((mov, idx) => (
                <div key={idx} className={`movimento-item ${mov.type}`}>
                  <span className="tipo">{mov.type === 'withdrawal' ? 'Sangria' : 'Suprimento'}</span>
                  <span className="valor">R$ {parseFloat(mov.amount).toFixed(2)}</span>
                  <span className="hora">{new Date(mov.created_at).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Observações */}
        <div className="notas-section">
          <label>Observações de Fechamento</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Diferença de R$ 0,50 devido a arredondamento de troco..."
            rows="3"
          />
        </div>

        {/* Botões de Ação */}
        <div className="actions">
          <button
            className="btn-fechar"
            onClick={handleCloseCaixa}
            disabled={processing}
          >
            {processing ? 'Processando...' : 'Confirmar Fechamento'}
          </button>
          <button className="btn-cancelar" onClick={() => window.history.back()}>
            Voltar
          </button>
        </div>
      </div>
    </PageShell>
  );
}
