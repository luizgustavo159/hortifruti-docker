import { useState, useEffect } from "react";
import "./RelogioGlobal.css";

export function RelogioGlobal() {
  const [agora, setAgora] = useState(new Date());

  useEffect(() => {
    const intervalo = setInterval(() => {
      setAgora(new Date());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  const pad = (n) => String(n).padStart(2, "0");

  const dia = pad(agora.getDate());
  const mes = pad(agora.getMonth() + 1);
  const ano = agora.getFullYear();
  const horas = pad(agora.getHours());
  const minutos = pad(agora.getMinutes());
  const segundos = pad(agora.getSeconds());

  return (
    <div className="relogio-global" aria-label="Data e hora atual">
      <span className="relogio-data">{dia}/{mes}/{ano}</span>
      <span className="relogio-separador"> - </span>
      <span className="relogio-hora">{horas}:{minutos}:{segundos}</span>
    </div>
  );
}
