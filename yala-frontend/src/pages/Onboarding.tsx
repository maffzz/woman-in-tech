import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/yala';
import { useAuth } from '../lib/auth';
import { Mascot } from '../components/Mascot';

interface Step { key: string; question: string; sub?: string; input: 'number' | 'age' | 'choice'; choices?: string[]; placeholder?: string; min?: number; max?: number }

const STEPS: Step[] = [
  {
    key: 'age',
    question: '¿Cuántos años tienes?',
    sub: 'Esto nos ayuda a calcular cuánto te falta para los 18 y activar tu historial con bancos.',
    input: 'age',
    placeholder: 'ej. 16',
    min: 12,
    max: 30,
  },
  {
    key: 'weekly',
    question: '¿Cuánto recibes de tus papás por semana? (en soles)',
    sub: 'Puede ser por Yape, en efectivo o como quieras. Solo para armar tu presupuesto.',
    input: 'number',
    placeholder: 'ej. 60',
    min: 1,
    max: 2000,
  },
  {
    key: 'food',
    question: '¿Cuánto cuesta tu menú o almuerzo normal?',
    sub: 'El almuerzo diario es el gasto que más se repite. Nos ayuda a armar tu tope de comida.',
    input: 'number',
    placeholder: 'ej. 8',
    min: 1,
    max: 100,
  },
  {
    key: 'outings_budget',
    question: '¿Cuánto gastas normalmente en una salida con amigos?',
    sub: 'Una salida puede ser ir al cine, a comer, a una fiesta. Lo que sea que hagas el finde.',
    input: 'number',
    placeholder: 'ej. 30',
    min: 0,
    max: 500,
  },
  {
    key: 'outings_freq',
    question: '¿Cada cuánto sueles salir con amigos?',
    sub: 'Así armamos tu tope semanal de salidas.',
    input: 'choice',
    choices: ['Casi todos los días', 'Una o dos veces por semana', 'Una vez cada dos semanas', 'Casi nunca'],
  },
  {
    key: 'transport',
    question: '¿Cuánto gastas en transporte a la semana?',
    sub: 'Combis, taxi, Uber, lo que uses para moverte.',
    input: 'number',
    placeholder: 'ej. 10',
    min: 0,
    max: 200,
  },
  {
    key: 'connect',
    question: 'Una última cosa: conecta tu correo para ver en qué se va tu plata',
    sub: 'Yala lee solo los correos de Yape o BCP (solo lectura). Nunca guarda el contenido, solo el monto y a quién le pagaste.',
    input: 'choice',
    choices: ['Conectar mi Gmail ahora', 'Lo hago después'],
  },
];

// Mapea las respuestas a presupuestos semanales por categoría
function buildBudgets(answers: Record<string, string | number>) {
  const weekly = Number(answers.weekly) || 60;
  const food = Number(answers.food) || 8;
  const transport = Number(answers.transport) || 10;
  const outingsBudget = Number(answers.outings_budget) || 30;
  const freq = String(answers.outings_freq ?? '');

  // Salidas: presupuesto por salida × frecuencia semanal
  const freqMultiplier = freq.includes('todos los días') ? 4
    : freq.includes('Una o dos') ? 1.5
    : freq.includes('cada dos') ? 0.5
    : 0.25;
  const outingsRaw = Math.round(outingsBudget * freqMultiplier);

  // Comida: almuerzo × 5 días + 20% snacks — pero sin pasarse de la mitad de la mesada
  const foodRaw = Math.round(food * 5 * 1.2);

  // Ahorro: 10% de la mesada
  const savingsRaw = Math.round(weekly * 0.1);

  // Ajustar proporcionalmente para que la suma no supere la mesada
  const available = weekly - savingsRaw;
  const rawTotal = foodRaw + Math.round(transport) + outingsRaw;
  const scale = rawTotal > available ? available / rawTotal : 1;

  return {
    foodWeekly: Math.max(5, Math.round(foodRaw * scale)),
    transport: Math.max(2, Math.round(transport * scale)),
    outingsWeekly: Math.max(5, Math.round(outingsRaw * scale)),
    savingsWeekly: savingsRaw,
  };
}

export default function Onboarding() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = Math.round(((step) / STEPS.length) * 100);

  const next = async () => {
    setErr(null);
    const val = value.trim();

    // Validación
    if (current.input !== 'choice' && !val) { setErr('Escribe un número para continuar'); return; }
    if (current.input !== 'choice' && current.input !== 'age') {
      const n = Number(val);
      if (isNaN(n) || n < (current.min ?? 0)) { setErr(`Debe ser al menos ${current.min ?? 0}`); return; }
    }
    if (current.input === 'age') {
      const n = Number(val);
      if (isNaN(n) || n < 12 || n > 30) { setErr('Pon una edad entre 12 y 30'); return; }
    }

    const newAnswers = { ...answers, [current.key]: current.input === 'choice' ? val : Number(val) };
    setAnswers(newAnswers);

    if (isLast) {
      setBusy(true);
      try {
        // Calcular fecha de nacimiento aproximada desde la edad
        const age = Number(newAnswers.age);
        const birthYear = new Date().getFullYear() - age;
        const birthDate = `${birthYear}-01-01`;

        // Guardar mesada y edad en el perfil
        await api.patchMe({
          weeklyAllowance: Number(newAnswers.weekly),
          birthDate,
          dataMode: val === 'Conectar mi Gmail ahora' ? 'gmail' : 'demo',
        });

        // Armar y aplicar presupuestos sugeridos
        const b = buildBudgets(newAnswers);
        await Promise.all([
          api.setBudget('comida', b.foodWeekly),
          api.setBudget('transporte', b.transport),
          api.setBudget('salidas', b.outingsWeekly),
          api.setBudget('ahorro', b.savingsWeekly),
        ]);

        await refresh();

        // Si quiere conectar Gmail, redirige al flujo
        if (val === 'Conectar mi Gmail ahora') {
          nav('/conectar');
        } else {
          nav('/');
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Error al guardar');
        setBusy(false);
      }
      return;
    }

    setStep(step + 1);
    setValue('');
  };

  const skip = () => {
    setAnswers({ ...answers, [current.key]: '' });
    setStep(step + 1);
    setValue('');
    setErr(null);
  };

  return (
    <div className="login" style={{ justifyContent: 'flex-start', paddingTop: 40 }}>
      {/* Barra de progreso */}
      <div style={{ width: '100%', maxWidth: 360, marginBottom: 32 }}>
        <div style={{ height: 4, background: '#e8e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--purple)', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'right' }}>Paso {step + 1} de {STEPS.length}</div>
      </div>

      <Mascot kind="pollito" size={90} />

      <div style={{ width: '100%', maxWidth: 360, marginTop: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>{current.question}</h2>
        {current.sub && <p className="muted" style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{current.sub}</p>}

        {current.input === 'choice' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {current.choices!.map((c) => (
              <button
                key={c}
                className={`btn ${value === c ? '' : 'ghost'}`}
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => setValue(c)}
              >
                {value === c ? '✓ ' : ''}{c}
              </button>
            ))}
          </div>
        ) : (
          <label className="field" style={{ marginBottom: 0 }}>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={current.placeholder}
              min={current.min}
              max={current.max}
              onKeyDown={(e) => e.key === 'Enter' && next()}
              autoFocus
              style={{ fontSize: 28, textAlign: 'center', fontWeight: 700 }}
            />
            {current.key !== 'age' && <span style={{ textAlign: 'center', display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>soles peruanos</span>}
          </label>
        )}

        {err && <div className="center-note err" style={{ padding: 8, marginTop: 12 }}>{err}</div>}

        <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
          <button
            className="btn"
            disabled={busy || (current.input === 'choice' ? !value : false)}
            onClick={next}
          >
            {busy ? 'Guardando…' : isLast ? 'Comenzar' : 'Siguiente →'}
          </button>
          {step > 0 && !isLast && current.key !== 'weekly' && current.key !== 'age' && (
            <button className="btn ghost" style={{ fontSize: 13 }} onClick={skip}>
              No sé / saltar
            </button>
          )}
          {step > 0 && (
            <button className="btn ghost" style={{ fontSize: 12, border: 0, color: 'var(--muted)' }}
              onClick={() => { setStep(step - 1); setValue(String(answers[STEPS[step - 1].key] ?? '')); setErr(null); }}>
              ← Atrás
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
