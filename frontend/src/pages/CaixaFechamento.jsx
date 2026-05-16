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
        setCaixaData(caixa);
        setMovements(movs.data || []);
        setTotalExpected(caixa.total_expected || 0);
      } catch (error) {
        toast.error('Erro ao carregar dados de caixa: ' + error.message);
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
    try {
      const response = await apiFetch('/pos/cash-session/movement', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amount,
          description: `${type === 'withdrawal' ? 'Sangria' : 'Suprimento'} - ${new Date().toLocaleTimeString()}`,
        }),
      });
      toast.success(`${type === 'withdrawal' ? 'Sangria' : 'Suprimento'} registrado com sucesso!`);
      setMovements([response, ...movements]);
    } catch (error) {
      toast.error('Erro ao registrar movimentação: ' + error.message);
    }
  }, [movements]);

  // Fechar caixa
  const handleCloseCaixa = async () => {
    if (!totalCounted) {
      toast.error('Informe o valor contado em caixa');
      return;
    }

    setProcessing(true);
    try {
      await apiFetch('/pos/cash-session/close', {
        method: 'POST',
        body: JSON.stringify({
          total_counted: totalCounted,
          difference,
          notes,
        }),
      });
      toast.success('Caixa fechado com sucesso!');
      // Redirecionar ou resetar
      setTimeout(() => {
        window.location.reload();
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

  return (
    <PageShell
      title="Fechamento de Caixa"
      subtitle="Encerre o turno e confira o caixa"
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
          <div className={`resumo-card ${difference === 0 ? 'balanced' : difference > 0 ? 'surplus' : 'deficit'}`}>
            <h3>Diferença</h3>
            <p className="valor">R$ {difference.toFixed(2)}</p>
            <p className="status">
              {difference === 0 && '✓ Caixa Balanceado'}
              {difference > 0 && '↑ Sobra'}
              {difference < 0 && '↓ Falta'}
            </p>
          </div>
        </div>

        {/* Movimentações */}
        <div className="movimentos-section">
          <h3>Movimentações do Dia</h3>
          <div className="movimento-buttons">
            <button
              className="btn-movimento btn-sangria"
              onClick={() => addMovement('withdrawal', prompt('Valor da sangria:') || 0)}
            >
              💰 Sangria
            </button>
            <button
              className="btn-movimento btn-suprimento"
              onClick={() => addMovement('deposit', prompt('Valor do suprimento:') || 0)}
            >
              ➕ Suprimento
            </button>
          </div>

          <div className="movimentos-list">
            {movements.map((mov, idx) => (
              <div key={idx} className={`movimento-item ${mov.type}`}>
                <span className="tipo">{mov.type === 'withdrawal' ? 'Sangria' : 'Suprimento'}</span>
                <span className="valor">R$ {mov.amount.toFixed(2)}</span>
                <span className="hora">{new Date(mov.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div className="notas-section">
          <label>Observações</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione observações sobre o fechamento..."
            rows="4"
          />
        </div>

        {/* Botões de Ação */}
        <div className="actions">
          <button
            className="btn-fechar"
            onClick={handleCloseCaixa}
            disabled={processing}
          >
            {processing ? 'Fechando...' : 'Fechar Caixa'}
          </button>
          <button className="btn-cancelar" onClick={() => window.history.back()}>
            Cancelar
          </button>
        </div>
      </div>
    </PageShell>
  );
}
