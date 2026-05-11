import { useTheme } from '../context/ThemeContext';
import './ThemeSwitcher.css';

export function ThemeSwitcher() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      className="theme-switcher"
      onClick={toggleTheme}
      title={isDark ? 'Modo Claro' : 'Modo Escuro'}
      aria-label="Alternar tema"
    >
      {isDark ? (
        <span className="icon">☀️</span>
      ) : (
        <span className="icon">🌙</span>
      )}
    </button>
  );
}
