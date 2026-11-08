/** "S/ 6", "S/ 1.5", "S/ 11.50" */
export const soles = (n: number, fixed = false) => {
  const v = Math.round(n * 100) / 100;
  return 'S/ ' + (fixed ? v.toFixed(2) : String(v));
};
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};
export const firstName = (n: string) => n.split(' ')[0];
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
export const CAT_LABEL: Record<string, string> = {
  comida: 'Comida', transporte: 'Transporte', salidas: 'Salidas', suscripciones: 'Suscrip.', juegos: 'Juegos',
  entretenimiento: 'Entretenimiento', recargas: 'Recargas', ahorro: 'Ahorro', otros: 'Otros',
};
export const CAT_COLOR: Record<string, string> = {
  comida: '#5fe8d8', salidas: '#c3b8f5', transporte: '#8fd3f7', suscripciones: '#8f7bf0', ahorro: '#2a1a6b',
  juegos: '#a9e4ff', entretenimiento: '#b7a9f7', recargas: '#9ad9cf', otros: '#cfcde6',
};
