/**
 * Niveles de voz simulados para las personas de ejemplo. Determinista (sin azar): cada persona tiene su
 * propio ritmo de franjas de 3 s y habla en algo más de la mitad de ellas, así que casi siempre hay alguien
 * hablando y a veces dos a la vez. Mientras habla, su nivel sube y baja como una voz. Con movimiento
 * reducido el nivel solo cambia en dos escalones y a ritmo lento (lo decide `useAudioLevel` con el intervalo).
 */
const FRANJA_MS = 3000;
const PROBABILIDAD_DE_HABLAR = 55; // % de las franjas

const mezclar = (n: number) => {
  let h = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Nivel 0–1 de la persona número `i` en el instante `t` (ms). */
export function nivelDeVoz(i: number, t: number, reducido: boolean): number {
  const desfase = i * 1100; // cada persona con su propio ritmo
  const franja = Math.floor((t + desfase) / FRANJA_MS);
  if (mezclar(franja * 7 + i * 131) % 100 >= PROBABILIDAD_DE_HABLAR) return 0;
  if (((t + desfase) % FRANJA_MS) / FRANJA_MS > 0.9) return 0; // respiro entre frases
  const voz = 0.45 + 0.4 * Math.abs(Math.sin(t / 170 + i * 2.1)) * (0.7 + 0.3 * Math.sin(t / 520));
  if (reducido) return voz > 0.62 ? 0.7 : 0.4;
  return Math.min(1, voz);
}
