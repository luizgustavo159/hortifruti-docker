import { useState, useRef, useEffect } from 'react';
import { PageShell } from '../components/PageShell';
import { toast } from 'sonner';
import './AIAssistant.css';

export function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Olá! 👋 Sou seu Assistente de IA. O sistema está agora operando 100% com seus dados REAIS de produção. No momento, estou finalizando a integração para responder perguntas complexas via chat, mas todos os seus relatórios e dashboards já utilizam os dados reais do seu banco de dados PostgreSQL.',
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
    return `🤖 **Status do Sistema**\n\nSeu sistema Hortifruti está totalmente operacional em ambiente de produção. \n\nOs cálculos de lucro agora utilizam o **CMV (Custo de Mercadoria Vendida)** real baseado nos seus preços de custo. \n\nEstou à disposição para ajudar com dúvidas sobre o uso do sistema enquanto finalizamos as análises preditivas!`;
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
