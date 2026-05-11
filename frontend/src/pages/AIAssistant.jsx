import { useState, useRef, useEffect } from 'react';
import { PageShell } from '../components/PageShell';
import { toast } from 'sonner';
import './AIAssistant.css';

export function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Olá! 👋 Sou seu Assistente de IA. Posso ajudar você com análise de vendas, sugestões de compras e insights sobre o negócio. O que você gostaria de saber?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateAIResponse = (userMessage) => {
    // Simular respostas de IA baseadas em palavras-chave
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('venda') || lowerMessage.includes('faturamento')) {
      return `📊 **Análise de Vendas**\n\nBaseado nos últimos 7 dias:\n- Total: R$ 45.230\n- Crescimento: +12% vs semana anterior\n- Ticket médio: R$ 87.50\n- Produto mais vendido: Banana (1.240 un)\n- Horário de pico: 12h-14h`;
    }

    if (lowerMessage.includes('compra') || lowerMessage.includes('reposição')) {
      return `🛒 **Sugestões de Compra**\n\nProdutos que devem ser reabastecidos:\n1. Alface - Crítico (45 un) → Sugerir 200 un\n2. Tomate - Baixo (80 un) → Sugerir 150 un\n3. Banana - Normal (200 un) → Sugerir 100 un\n\nEstimativa: R$ 1.200 de investimento`;
    }

    if (lowerMessage.includes('operador') || lowerMessage.includes('funcionário')) {
      return `👥 **Performance de Operadores**\n\n1. Maria Santos - 94.7% da meta ⭐\n2. João Silva - 83.3% da meta\n3. Ana Oliveira - 92.7% da meta\n4. Pedro Costa - 78.7% da meta\n\nRecomendação: Oferecer bônus para Maria!`;
    }

    if (lowerMessage.includes('lucro') || lowerMessage.includes('margem')) {
      return `💰 **Análise de Lucratividade**\n\nMargem bruta: 28.5%\nMargem líquida: 12.3%\n\nProdutos mais lucrativos:\n1. Frutas premium - 35% margem\n2. Verduras orgânicas - 32% margem\n3. Tubérculos - 18% margem\n\nDica: Aumentar estoque de frutas premium!`;
    }

    if (lowerMessage.includes('estoque') || lowerMessage.includes('inventário')) {
      return `📦 **Status do Estoque**\n\nTotal de itens: 2.450 unidades\nValor total: R$ 18.900\n\nProdutos críticos (< 50 un):\n- Alface Crespa: 45 un\n- Cenoura: 38 un\n\nProdutos parados (sem giro há 7 dias):\n- Couve-flor: 12 un\n\nRecomendação: Fazer promoção!`;
    }

    if (lowerMessage.includes('horário') || lowerMessage.includes('pico')) {
      return `⏰ **Análise de Horários**\n\nHorários de maior movimento:\n- 12:00-14:00: Pico máximo (45% das vendas)\n- 18:00-19:30: Pico secundário (28% das vendas)\n- 07:00-09:00: Movimento moderado (18% das vendas)\n\nRecomendação: Aumentar equipe entre 12h-14h`;
    }

    return `🤖 Entendi sua pergunta! Infelizmente, não tenho dados específicos sobre isso. Posso ajudar com:\n- Análise de vendas\n- Sugestões de compra\n- Performance de operadores\n- Análise de lucratividade\n- Status do estoque\n- Análise de horários de pico`;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Adicionar mensagem do usuário
    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      text: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Simular delay de resposta
    setTimeout(() => {
      const aiResponse = {
        id: messages.length + 2,
        type: 'bot',
        text: generateAIResponse(input),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setLoading(false);
    }, 800);
  };

  const quickQuestions = [
    '📊 Como foram as vendas?',
    '🛒 O que preciso comprar?',
    '👥 Como está a performance?',
    '💰 Qual é meu lucro?',
    '📦 Status do estoque?',
    '⏰ Quais são os horários de pico?',
  ];

  return (
    <PageShell
      title="Assistente de IA"
      subtitle="Análise inteligente do seu negócio"
    >
      <div className="ai-assistant">
        <div className="chat-container">
          <div className="messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.type}`}>
                <div className="message-content">
                  {msg.type === 'bot' && <span className="bot-icon">🤖</span>}
                  <div className="message-text">{msg.text}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="message bot">
                <div className="message-content">
                  <span className="bot-icon">🤖</span>
                  <div className="message-text typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="input-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Faça uma pergunta sobre seu negócio..."
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? '⏳' : '📤'}
            </button>
          </form>
        </div>

        <div className="quick-questions">
          <h3>Perguntas Rápidas</h3>
          <div className="questions-grid">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                className="quick-btn"
                onClick={() => setInput(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
