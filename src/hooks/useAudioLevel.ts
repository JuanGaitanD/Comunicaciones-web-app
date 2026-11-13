import { useState, useEffect } from 'react';
import { nivelesSimulados } from '../demo/modo';

export function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    // Demo: el nivel viene de un generador, no de audio real. Con movimiento reducido se actualiza
    // despacio y por escalones; sin él, unas 10 veces por segundo.
    const simulado = stream ? nivelesSimulados.get(stream) : undefined;
    if (simulado) {
      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const paso = () => setLevel(simulado(Date.now(), reducido));
      paso();
      const id = window.setInterval(paso, reducido ? 700 : 100);
      return () => window.clearInterval(id);
    }

    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationFrameId: number;

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      // Normalize to 0-1 range (approximate)
      setLevel(Math.min(1, average / 128));
      animationFrameId = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      cancelAnimationFrame(animationFrameId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [stream]);

  return level;
}
