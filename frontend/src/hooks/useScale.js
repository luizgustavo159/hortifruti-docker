/**
 * useScale — Hook para leitura de balança via Web Serial API
 *
 * Compatível com balanças Toledo, Filizola, Urano e similares que enviam
 * peso no formato texto pela porta serial (RS-232 / USB-Serial).
 *
 * Parâmetros de comunicação padrão (ajustáveis):
 *   - Baud rate: 9600
 *   - Data bits: 7 ou 8
 *   - Stop bits: 1
 *   - Parity: even (par) ou none
 *
 * Protocolo de leitura:
 *   A maioria das balanças envia uma string contendo o peso, ex:
 *     "  1.250 kg\r\n"  ou  "ST,GS,+  1.250 kg\r\n"
 *   O hook extrai o primeiro número decimal encontrado na string.
 *
 * Uso:
 *   const { weight, connected, connecting, error, connect, disconnect, readWeight } = useScale();
 */

import { useState, useRef, useCallback } from "react";

// Regex para extrair peso decimal de qualquer string de balança
const WEIGHT_REGEX = /([0-9]+[.,][0-9]{1,3})/;

export function useScale() {
  const [weight, setWeight] = useState(null);       // último peso lido (número)
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readingRef = useRef(false);

  /**
   * Solicita ao usuário que selecione a porta serial e inicia a leitura contínua.
   * Configurações padrão para balanças Toledo/Filizola/Urano.
   */
  const connect = useCallback(async (options = {}) => {
    if (!("serial" in navigator)) {
      setError("Web Serial API não suportada. Use Chrome ou Edge.");
      return false;
    }

    setConnecting(true);
    setError("");

    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: options.baudRate || 9600,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 1,
        parity: options.parity || "none",
        flowControl: options.flowControl || "none",
      });

      portRef.current = port;
      setConnected(true);
      setConnecting(false);

      // Inicia leitura contínua em background
      readingRef.current = true;
      readLoop(port);

      return true;
    } catch (err) {
      setConnecting(false);
      if (err.name !== "NotFoundError") {
        // NotFoundError = usuário cancelou o seletor de porta
        setError("Erro ao conectar à balança: " + (err.message || err));
      }
      return false;
    }
  }, []);

  /**
   * Loop de leitura contínua da porta serial.
   * Acumula bytes até encontrar \n e tenta extrair o peso.
   */
  const readLoop = async (port) => {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    readerRef.current = reader;

    let buffer = "";

    try {
      while (readingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += value;

        // Processa linhas completas
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ""; // guarda fragmento incompleto

        for (const line of lines) {
          const match = WEIGHT_REGEX.exec(line);
          if (match) {
            const parsed = parseFloat(match[1].replace(",", "."));
            if (!isNaN(parsed) && parsed >= 0) {
              setWeight(parsed);
            }
          }
        }
      }
    } catch (err) {
      if (readingRef.current) {
        setError("Erro na leitura da balança: " + (err.message || err));
      }
    } finally {
      reader.releaseLock();
    }
  };

  /**
   * Encerra a conexão com a balança.
   */
  const disconnect = useCallback(async () => {
    readingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (_err) {
      // ignora erros no fechamento
    }
    setConnected(false);
    setWeight(null);
  }, []);

  /**
   * Retorna o peso atual (snapshot do último valor recebido).
   * Útil para capturar o peso no momento do clique do operador.
   */
  const readWeight = useCallback(() => {
    return weight;
  }, [weight]);

  return {
    weight,
    connected,
    connecting,
    error,
    connect,
    disconnect,
    readWeight,
  };
}
