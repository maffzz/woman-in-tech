# Yala 🐐

**Tu plata, tus panas y tu racha. Sin regaños.**

App peruana para adolescentes que reciben dinero por Yape o BCP. Yala lee tus notificaciones de pago, clasifica tus gastos con IA, te ayuda a gestionar salidas con amigos y construye un perfil financiero que, a los 18, puedes compartir con un banco para tu primera tarjeta de crédito.

---

## Estructura del proyecto

```
yala/
├── yala-backend/     API REST (Node 22 + TypeScript + Express + SQLite)
└── yala-frontend/    App React + Vite + TypeScript (mobile-first)
```

---

## Arranque rápido (desarrollo local)

### 1. Backend

```bash
cd yala-backend
cp .env.example .env   # luego edita .env con tus claves reales
npm install
npm run dev            # http://localhost:4000/api
```

### 2. Frontend

```bash
cd yala-frontend
cp .env.example .env   # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev            # http://localhost:5173
```

### 3. Verificar

```bash
# Demo de Diana lista en segundos:
curl -X POST http://localhost:4000/api/auth/demo
# → { token, user: { name: "Diana Zuñiga", dataMode: "demo" } }
```

Abre **http://localhost:5173** → "Entrar como Diana (demo)".

---

## Variables de entorno principales

Copia `yala-backend/.env.example` a `yala-backend/.env` y llena:

| Variable | Descripción |
|---|---|
| `FRONTEND_URL` | URL del frontend (CORS). Default: `http://localhost:5173` |
| `JWT_SECRET` | Secreto JWT. **Cambiar en producción.** |
| `ENCRYPTION_KEY` | 32+ chars. Cifra tokens de Gmail. **Cambiar en producción.** |
| `AI_PROVIDER` | `gemini` o `claude` (default: `claude`) |
| `GEMINI_API_KEY` | API key de Google AI (Gemini) |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` (recomendado para cuentas nuevas) |
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude), alternativa a Gemini |
| `GOOGLE_CLIENT_ID` | OAuth de Google Cloud (para Gmail y login con Google) |
| `GOOGLE_CLIENT_SECRET` | OAuth de Google Cloud |
| `YAPE_SENDER` | Remitentes aceptados, separados por coma. Default: Yape + BCP |

> Sin claves de IA ni Google, **todo funciona** en modo demo con plantillas de respaldo.

---

## Flujo de la app

```
Login (demo o Google)
  └─ Si es usuario nuevo → Onboarding (edad, mesada, hábitos) → Presupuestos auto
       └─ Home: consejo del día · stats · nivel de la mascota
            ├─ Secciones: gastos por categoría vs tope semanal
            ├─ Amigos: salidas con presupuesto · dividir cuenta · préstamos
            ├─ Perfil: score · simulador 3 meses · certificado para banco
            └─ Conectar Yape: Gmail OAuth · pegar correo · modo demo
```

---

## Funcionalidades principales

### Movimientos
- Lee correos de **Yape** (`notificaciones@yape.com.pe`) y **BCP** (`notificaciones@notificacionesbcp.com.pe`)
- Parser de regex con fallback a IA si no reconoce el formato
- **Nunca guarda el cuerpo del correo**: solo monto, fecha, destinatario y tipo
- Modo "pegar correo": el usuario pega el texto y se procesa igual

### IA (Gemini / Claude)
- Clasifica cada gasto en categorías (comida, transporte, juegos, etc.)
- Opina en una frase amable, sin regañar
- Genera el consejo del día con contexto real (gastos, préstamos por vencer)
- Si la IA falla o no hay clave → plantillas de palabras clave como respaldo automático
- Límite de 2 llamadas concurrentes (para no reventar el plan gratis de Gemini)

### Vida social
- **Salidas**: crea una salida con presupuesto, asocia gastos, ve la barra de progreso
- **Dividir cuenta**: partes iguales o personalizadas, genera préstamos automáticamente
- **Préstamos**: link único para que el amigo confirme sin crear cuenta, recordatorios amables, detección automática de pagos por Yape

### Perfil financiero
- Score 0–100 con 5 indicadores: control del gasto, ahorro, regularidad, pagar a tiempo, salidas
- Niveles gamificados: Huevo → Pollo → Gallo → Chivo → GOAT (racha de semanas dentro del presupuesto)
- Simulador "3 meses": muestra cómo sube el nivel con mejores hábitos
- Certificado para banco: expira en 30 días, requiere consentimiento, **solo a los 18** (excepción en demo)

### Privacidad
- Los amigos se guardan **solo como apodo**, nunca nombres reales
- Exportar mis datos (JSON)
- Borrar todo definitivamente
- Registro de consentimientos con fecha y versión

---

## Comandos útiles

```bash
# Backend
npm run dev        # servidor con hot-reload
npm test           # 26 pruebas (parser, e2e, IA, split)
npm run typecheck  # TypeScript sin compilar
npm run seed       # sembrar datos de demo manualmente

# Frontend
npm run dev        # Vite dev server
npm run build      # build de producción (incluye typecheck)
```

---

## Configurar Gmail OAuth (para la demo real)

1. [Google Cloud Console](https://console.cloud.google.com) → nuevo proyecto
2. APIs & Services → habilitar **Gmail API**
3. OAuth consent screen → modo **Testing** → agregar tu correo como *Test user*
4. Credentials → Create → OAuth 2.0 Client ID (Web) → agregar redirect URIs:
   - `http://localhost:4000/api/auth/google/callback`
   - `http://localhost:4000/api/gmail/callback`
5. Copiar `Client ID` y `Client Secret` a `yala-backend/.env`

> Si ves `Error 403: access_denied` → tu correo no está en la lista de Test users.
> Si ves `redirect_uri_mismatch` → la URI en Google Cloud no coincide exactamente.

---

## Antes de producción

- [ ] Cambiar `JWT_SECRET` y `ENCRYPTION_KEY` por valores aleatorios largos
- [ ] `ALLOW_DEV_LOGIN=false`
- [ ] `FRONTEND_URL` con el dominio real
- [ ] HTTPS en el backend
- [ ] Verificación de la app en Google (para Gmail fuera del modo Testing)

---

## Reglas de producto

1. **No existe rol de padre/madre**: los padres solo envían dinero.
2. **Amigos = solo apodo**. Nunca nombres completos ni contactos.
3. **Nunca guardar el cuerpo de los correos**.
4. Tono cercano, peruano, **sin regaños**.
5. El perfil **no es un historial crediticio formal**: siempre se muestra el disclaimer.
6. Prestar más no suma puntos; que un amigo no pague no baja el puntaje.
7. Funciona completo en **modo demo**, sin Gmail ni clave de IA.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · TypeScript · Express 5 · SQLite (better-sqlite3) · Zod |
| Frontend | React 18 · Vite · TypeScript · React Router 6 |
| IA | Gemini (Google AI) o Claude (Anthropic) · fallback a plantillas |
| Auth | JWT · Google OAuth 2.0 |
| Tests | Vitest (26 tests: e2e, parser BCP/Yape, IA, split) |

---

*Yala — Hackathon 2026 · "Construye la data que un banco necesita para darle a un joven su primera tarjeta."*
