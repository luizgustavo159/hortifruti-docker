import { useState, useEffect } from 'react';
import './OnboardingTour.css';

const TOUR_STEPS = [
  {
    id: 1,
    title: '👋 Bem-vindo ao GreenStore!',
    description: 'Vamos fazer um tour rápido para você aprender a usar o sistema.',
    target: null,
    position: 'center',
  },
  {
    id: 2,
    title: '🛒 Frente de Caixa',
    description: 'Aqui você registra as vendas. Busque produtos, adicione ao carrinho e finalize a venda.',
    target: 'nav-caixa',
    position: 'bottom',
  },
  {
    id: 3,
    title: '📦 Gestão de Estoque',
    description: 'Controle seus produtos, quantidades e movimentações de estoque.',
    target: 'nav-estoque',
    position: 'bottom',
  },
  {
    id: 4,
    title: '📊 Dashboard',
    description: 'Veja gráficos e análises em tempo real do seu negócio.',
    target: 'nav-dashboard',
    position: 'bottom',
  },
  {
    id: 5,
    title: '🤖 Assistente de IA',
    description: 'Faça perguntas sobre suas vendas e receba insights automáticos.',
    target: 'nav-ai',
    position: 'bottom',
  },
  {
    id: 6,
    title: '🌙 Modo Escuro',
    description: 'Alterne entre modo claro e escuro conforme sua preferência.',
    target: 'theme-switcher',
    position: 'bottom-left',
  },
  {
    id: 7,
    title: '✅ Pronto!',
    description: 'Você já conhece o básico. Explore e divirta-se gerenciando seu hortifruti!',
    target: null,
    position: 'center',
  },
];

export function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(false);

  useEffect(() => {
    // Verificar se o usuário já viu o tour
    const seen = localStorage.getItem('onboarding-seen');
    setHasSeenTour(!!seen);
  }, []);

  const startTour = () => {
    setIsOpen(true);
    setCurrentStep(0);
  };

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const endTour = () => {
    setIsOpen(false);
    localStorage.setItem('onboarding-seen', 'true');
    setHasSeenTour(true);
  };

  if (!isOpen) {
    return (
      <button
        className="onboarding-trigger"
        onClick={startTour}
        title="Iniciar tour"
      >
        ❓
      </button>
    );
  }

  const step = TOUR_STEPS[currentStep];
  const targetElement = step.target ? document.getElementById(step.target) : null;
  const rect = targetElement?.getBoundingClientRect();

  return (
    <>
      <div className="onboarding-overlay" onClick={endTour} />
      {targetElement && (
        <div
          className="onboarding-highlight"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}
      <div
        className={`onboarding-tooltip ${step.position}`}
        style={
          rect
            ? {
                top: rect.bottom + 16,
                left: rect.left + rect.width / 2 - 150,
              }
            : {}
        }
      >
        <div className="tooltip-header">
          <h3>{step.title}</h3>
          <button className="close-btn" onClick={endTour}>
            ✕
          </button>
        </div>
        <p>{step.description}</p>
        <div className="tooltip-footer">
          <div className="step-counter">
            {currentStep + 1} / {TOUR_STEPS.length}
          </div>
          <div className="tooltip-buttons">
            <button
              className="btn-secondary"
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              ← Anterior
            </button>
            <button className="btn-primary" onClick={nextStep}>
              {currentStep === TOUR_STEPS.length - 1 ? 'Concluir' : 'Próximo →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
