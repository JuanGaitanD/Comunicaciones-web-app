import { crearCliente } from './cliente';
import { avatarLocal } from './datos';
import { useRtcDemo } from './rtc';

/** Todo lo que se carga aparte al entrar en la demo: cliente simulado, avatares locales y llamada simulada. */
export function crearDemo(alSalir: () => void) {
  const { cliente, cerrar } = crearCliente(alSalir);
  return { cliente, cerrar, avatarDesdeConfig: avatarLocal, useRtc: useRtcDemo };
}

export type Demo = ReturnType<typeof crearDemo>;
