import { describe, expect, it } from 'vitest';
import { parseYapeText, splitPasted } from '../src/services/yapeParser';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures BCP — formato confirmado con correos reales (datos personales cambiados)
// remitente: notificaciones@notificacionesbcp.com.pe
// ──────────────────────────────────────────────────────────────────────────────
describe('parser BCP (formato confirmado)', () => {
  // Caso base: consumo con tarjeta de débito BCP en comercio con código "*"
  it('BCP — consumo tarjeta débito en comercio', () => {
    const raw = `Realizaste un consumo de S/ 29.00 con tu Tarjeta de Débito BCP en IZI*ALESAR ALM*00562153.
Por tu seguridad, te enviamos los datos de tu operación.
Monto
Total del consumo  S/ 29.00
Datos de la operación
Operación realizada  Consumo Tarjeta de Débito`;
    const p = parseYapeText(raw, new Date('2026-11-03T12:00:00Z'));
    expect(p).not.toBeNull();
    expect(p?.type).toBe('expense');
    expect(p?.amount).toBe(29);
    // El comercio debe aparecer en counterparty
    expect(p?.counterparty).toContain('IZI');
  });

  // Monto con decimales .50
  it('BCP — consumo con monto decimal', () => {
    const raw = `Realizaste un consumo de S/ 12.50 con tu Tarjeta de Débito BCP en TAMBO+.`;
    const p = parseYapeText(raw, new Date('2026-11-03T12:00:00Z'));
    expect(p?.type).toBe('expense');
    expect(p?.amount).toBe(12.5);
    expect(p?.counterparty?.toLowerCase()).toContain('tambo');
  });

  // Monto entero sin decimales
  it('BCP — consumo monto entero', () => {
    const raw = `Realizaste un consumo de S/ 50 con tu Tarjeta de Débito BCP en UBER.`;
    const p = parseYapeText(raw, new Date('2026-11-05T15:00:00Z'));
    expect(p?.type).toBe('expense');
    expect(p?.amount).toBe(50);
  });

  // Extracción de fecha del cuerpo del correo
  it('BCP — fecha en cuerpo (formato "3 de noviembre de 2026")', () => {
    const raw = `Realizaste un consumo de S/ 29.00 con tu Tarjeta de Débito BCP en KIOSCO.
Fecha de operación: 3 de noviembre de 2026, 07:15 a. m.`;
    const p = parseYapeText(raw, new Date());
    expect(p?.type).toBe('expense');
    expect(p?.amount).toBe(29);
    // Hora 7:15 Lima (UTC-5) → 12:15 UTC
    expect(p?.occurredAt).toMatch(/2026-11-03T12:15/);
  });

  // Correo BCP de abono (ingreso de dinero)
  it('BCP — abono en cuenta (ingreso)', () => {
    const raw = `Abono en tu cuenta BCP por S/ 60.00.`;
    const p = parseYapeText(raw, new Date('2026-11-04T10:00:00Z'));
    expect(p?.type).toBe('income');
    expect(p?.amount).toBe(60);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures Yape — formato NO confirmado con correos reales.
// Ajustar estos patrones cuando consigan 3-5 correos reales de Yape.
// remitente: notificaciones@yape.com.pe
// ──────────────────────────────────────────────────────────────────────────────
describe('parser Yape (fixtures de ejemplo — ajustar con correos reales)', () => {
  it('Yape — gasto: yapeaste', () => {
    const p = parseYapeText('¡Yapeaste S/ 12.50! Destinatario: Bodega Los Andes\n15 de octubre de 2026 - 03:20 p. m.');
    expect(p?.type).toBe('expense');
    expect(p?.amount).toBe(12.5);
    expect(p?.counterparty).toContain('Bodega');
    expect(p?.occurredAt).toBe('2026-10-15T20:20:00.000Z');
  });

  it('Yape — ingreso: te yapearon', () => {
    const p = parseYapeText('Rosa Z. te yapeó S/ 60. Fecha: 03/11/2026 01:05 p. m.');
    expect(p?.type).toBe('income');
    expect(p?.amount).toBe(60);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Casos negativos y utilidades
// ──────────────────────────────────────────────────────────────────────────────
describe('parser — casos negativos y utilidades', () => {
  it('texto que no es de pago → null', () => {
    expect(parseYapeText('Hola, promoción de pizzas 2x1 este fin de semana')).toBeNull();
  });

  it('correo BCP sin monto → null', () => {
    expect(parseYapeText('BCP te informa: tu tarjeta fue actualizada exitosamente.')).toBeNull();
  });

  it('separa varios correos pegados por ---', () => {
    const partes = splitPasted('correo uno\n---\ncorreo dos');
    expect(partes.length).toBe(2);
  });

  it('separa varios correos pegados por saltos de línea múltiples', () => {
    const partes = splitPasted('correo uno\n\n\ncorreo dos\n\n\ncorreo tres');
    expect(partes.length).toBe(3);
  });
});
