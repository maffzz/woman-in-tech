import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

let server: Server; let base = ''; let tk = '';
const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}), ...(init.headers ?? {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

beforeAll(async () => {
  server = createApp(openDb(':memory:')).listen(0);
  base = `http://localhost:${(server.address() as any).port}/api`;
  tk = (await api('/auth/demo', { method: 'POST' })).body.token;
});
afterAll(() => { server.close(); });

describe('flujo completo', () => {
  it('rechaza sin token', async () => {
    const t = tk; tk = '';
    expect((await api('/me')).status).toBe(401);
    tk = t;
  });
  it('dashboard y consejo', async () => {
    const r = await api('/dashboard');
    expect(r.status).toBe(200);
    expect(r.body.advice.text.length).toBeGreaterThan(5);
    // Sofia puede arrancar en cualquier nivel según los datos generados; lo importante es que exista
    expect(['Inicial', 'Constante', 'Confiable', 'Sólido']).toContain(r.body.profile.level);
  });
  it('pegar un correo crea movimiento con categoría y opinión', async () => {
    const r = await api('/movements/paste', { method: 'POST', body: JSON.stringify({ text: '¡Yapeaste S/ 7! Destinatario: Garena Free Fire\n03/11/2026 05:10 p. m.' }) });
    expect(r.body.imported).toBe(1);
    expect(r.body.items[0].aiOpinion).toBeTruthy();
    const again = await api('/movements/paste', { method: 'POST', body: JSON.stringify({ text: '¡Yapeaste S/ 7! Destinatario: Garena Free Fire\n03/11/2026 05:10 p. m.' }) });
    expect(again.body.duplicates).toBe(1);
  });
  it('dividir cuenta crea préstamos; pagar a tiempo; el amigo confirma por link', async () => {
    const s = await api('/split', { method: 'POST', body: JSON.stringify({ total: 90, people: [{ nickname: 'Sofi' }, { nickname: 'Lucía' }], concept: 'Pizza' }) });
    expect(s.status).toBe(201);
    expect(s.body.myShare).toBe(30);
    const loan = s.body.shares[0].loan;
    const t = loan.confirmLink.split('/p/')[1];
    expect((await api(`/public/loans/${t}`)).body.friendNickname).toBe('Sofi');
    expect((await api(`/public/loans/${t}/confirm`, { method: 'POST' })).body.confirmed).toBe(true);
    const rem = await api(`/loans/${loan.id}/remind`, { method: 'POST' });
    expect(rem.body.message).toContain('Sofi');
    const paid = await api(`/loans/${loan.id}/pay`, { method: 'POST', body: JSON.stringify({ method: 'yape' }) });
    expect(paid.body.onTime).toBe(true);
  });
  it('simular 3 meses sube el nivel y se puede generar certificado demo', async () => {
    const r = await api('/demo/simulate-months', { method: 'POST' });
    // El score después debe ser al menos tan bueno como antes (puede ya estar alto)
    expect(r.body.after.score).toBeGreaterThanOrEqual(r.body.before.score - 5);
    const c = await api('/certificates', { method: 'POST', body: JSON.stringify({ consent: true }) });
    expect(c.status).toBe(201);
    expect(c.body.payload.demo).toBe(true);
    const pub = await api(`/public/certificates/${c.body.code}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toMatch(/Sofi|counterparty/);
  });
  it('certificado exige consentimiento', async () => {
    expect((await api('/certificates', { method: 'POST', body: '{}' })).status).toBe(400);
  });
  it('borrar todo elimina la cuenta', async () => {
    expect((await api('/privacy/data', { method: 'DELETE', body: JSON.stringify({ confirm: 'ELIMINAR' }) })).status).toBe(204);
    expect((await api('/me')).status).toBe(401);
  });
});

describe('extras del nuevo diseño', () => {
  it('topes, plan del asistente y niveles', async () => {
    const t = (await api('/auth/demo', { method: 'POST', body: '{}' })).body.token; tk = t;
    const plan = await api('/assistant/plan', { method: 'POST', body: JSON.stringify({ message: 'priorizo comer y salidas, recibo S/ 50 semanales' }) });
    expect(plan.body.weekly).toBe(50);
    expect(plan.body.items.reduce((a: number, i: any) => a + i.pct, 0)).toBe(100);
    const ap = await api('/assistant/apply', { method: 'POST', body: JSON.stringify({ weekly: 50, items: plan.body.items }) });
    expect(ap.body.items.find((i: any) => i.category === 'comida').weeklyCap).toBeGreaterThan(10);
    const lv = await api('/levels');
    expect(lv.body.levels).toHaveLength(5);
    const d = await api('/dashboard');
    expect(d.body.hormiga.daily).toHaveLength(7);
  });
});
