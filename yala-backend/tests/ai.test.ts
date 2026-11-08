/**
 * Tests del módulo ai.ts con fetch simulado.
 * No requiere claves reales: verifica que el fallback a plantillas funciona
 * cuando Gemini/Claude responde con error 429, 5xx o JSON roto.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Importamos después de mockear
let classifyAndOpine: typeof import('../src/services/ai').classifyAndOpine;
let aiIsReal: typeof import('../src/services/ai').aiIsReal;

const mockCtx = {
  byCategory: { juegos: 20 },
  prevByCategory: { juegos: 10 },
  total: 20,
  prevTotal: 10,
};

describe('ai.ts — fallback a plantillas cuando la IA falla', () => {
  beforeEach(async () => {
    // Limpiar caché de módulos para que cada test use su propio fetch mock
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa plantilla cuando Gemini responde 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));
    // Forzamos config para que parezca que hay clave de Gemini
    vi.doMock('../src/config', () => ({
      config: { aiMode: 'real', aiProvider: 'gemini', geminiKey: 'fake-key', geminiModel: 'gemini-2.5-flash-lite', anthropicKey: '' },
      CATEGORIES: ['comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros'],
    }));
    const ai = await import('../src/services/ai');
    const result = await ai.classifyAndOpine({ amount: 15, type: 'expense', counterparty: 'Garena Free Fire' }, mockCtx);
    // Con 429, debe caer al modo cache → source debe ser 'cache'
    expect(result.source).toBe('cache');
    expect(result.category).toBe('juegos');
    expect(result.opinion.length).toBeGreaterThan(0);
  });

  it('usa plantilla cuando Gemini responde JSON roto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'esto no es json valido }{' }] } }],
      }),
    }));
    vi.doMock('../src/config', () => ({
      config: { aiMode: 'real', aiProvider: 'gemini', geminiKey: 'fake-key', geminiModel: 'gemini-2.5-flash-lite', anthropicKey: '' },
      CATEGORIES: ['comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros'],
    }));
    const ai = await import('../src/services/ai');
    const result = await ai.classifyAndOpine({ amount: 15, type: 'expense', counterparty: 'Roblox' }, mockCtx);
    expect(result.source).toBe('cache');
    expect(result.category).toBe('juegos');
  });

  it('usa plantilla cuando AI_MODE es cache', async () => {
    vi.doMock('../src/config', () => ({
      config: { aiMode: 'cache', aiProvider: 'gemini', geminiKey: 'fake-key', geminiModel: 'gemini-2.5-flash-lite', anthropicKey: '' },
      CATEGORIES: ['comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros'],
    }));
    const ai = await import('../src/services/ai');
    // aiIsReal debe ser false en modo cache
    expect(ai.aiIsReal()).toBe(false);
    const result = await ai.classifyAndOpine({ amount: 5, type: 'expense', counterparty: 'Tambo' }, mockCtx);
    expect(result.source).toBe('cache');
  });

  it('responde con source ai cuando Gemini devuelve JSON válido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ category: 'juegos', opinion: 'S/ 15 en juegos, va bien mientras no se repita.' }) }],
          },
        }],
      }),
    }));
    vi.doMock('../src/config', () => ({
      config: { aiMode: 'real', aiProvider: 'gemini', geminiKey: 'fake-key', geminiModel: 'gemini-2.5-flash-lite', anthropicKey: '' },
      CATEGORIES: ['comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros'],
    }));
    const ai = await import('../src/services/ai');
    const result = await ai.classifyAndOpine({ amount: 15, type: 'expense', counterparty: 'Garena' }, mockCtx);
    expect(result.source).toBe('ai');
    expect(result.category).toBe('juegos');
    expect(result.opinion).toContain('S/ 15');
  });
});
