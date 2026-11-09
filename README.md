# Yala

**Con Yala, cada yapeo cuenta.**

App financiera para adolescentes peruanos de 15 a 17 años que reciben dinero por Yape o BCP. Yala lee tus notificaciones de pago, clasifica tus gastos con IA, te ayuda a gestionar salidas con amigos y construye un perfil de hábitos que, al cumplir 18, puedes compartir con un banco para acceder a tu primera tarjeta de crédito.

---

## El problema que resuelve

Sofia tiene 16 años, recibe S/ 80 semanales por Yape y no sabe en qué se le va la plata. No tiene historial crediticio. A los 18 será invisible para los bancos. Yala construye esa data desde ahora, con sus propios hábitos reales, sin supervisión de padres ni formularios bancarios.

---

## Estructura del proyecto

```
yala/
├── yala-backend/     API REST (Node 22 · TypeScript · Express · SQLite)
└── yala-frontend/    PWA React + Vite + TypeScript (mobile-first, instalable)
```

---

## Arranque local

### Backend

```bash
cd yala-backend
cp .env.example .env   # edita con tus claves
npm install
npm run dev            # http://localhost:4000/api
```

### Frontend

```bash
cd yala-frontend
cp .env.example .env   # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev            # http://localhost:5173
```

### Demo instantánea

```bash
curl -X POST http://localhost:4000/api/auth/demo
```

Devuelve un token de Sofia Zuñiga con 9 semanas de historial generado, nivel Conejo y préstamos pendientes listos para la demo. Abre `http://localhost:5173` → "Entrar como Sofia (demo)".

---

## Deploy

| Servicio | Plataforma | Config |
|---|---|---|
| Backend | Render (Web Service) | Root: `yala-backend` · Build: `npm install` · Start: `npm start` |
| Frontend | Netlify | Root: `yala-frontend` · Build: `npm run build` · Publish: `dist` |

El `netlify.toml` y `render.yaml` están en el repo con la configuración base. Las variables de entorno se setean en cada plataforma (ver sección siguiente).

### Variables de entorno del backend (Render)

| Variable | Descripción |
|---|---|
| `FRONTEND_URL` | URL de Netlify (CORS y redirects OAuth) |
| `JWT_SECRET` | Secreto JWT — generar con `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 32+ chars — generar con `openssl rand -hex 32` |
| `AI_PROVIDER` | `gemini` o `claude` (default: `claude`) |
| `GEMINI_API_KEY` | API key de Google AI Studio |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `ANTHROPIC_API_KEY` | Alternativa a Gemini |
| `GOOGLE_CLIENT_ID` | OAuth de Google Cloud (Gmail + login) |
| `GOOGLE_CLIENT_SECRET` | OAuth de Google Cloud |
| `YAPE_SENDER` | `notificaciones@yape.com.pe,notificaciones@notificacionesbcp.com.pe` |
| `ALLOW_DEMO` | `true` |
| `ALLOW_DEMO_CERT` | `true` |

### Variable de entorno del frontend (Netlify)

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://tu-backend.onrender.com/api` |

Sin claves de IA ni Google, **todo funciona en modo demo** con plantillas de respaldo.

---

## Flujo de la app

```
Login (demo o Google)
  └─ Usuario nuevo → Onboarding (edad, mesada, hábitos) → presupuestos automáticos
       └─ Home: consejo del día · stats · nivel de la mascota · deuda pendiente
            ├─ Secciones: categorías con % de uso · Salidas dentro de la categoría
            ├─ Amigos: Préstamos · Dividir cuenta
            ├─ Perfil: score · simulador 3 meses · certificado para banco
            └─ Conectar: Gmail OAuth · pegar correo BCP/Yape · modo demo
```

---

## Funcionalidades

### Movimientos automáticos
- Lee notificaciones de **Yape** y **BCP** (consumo con tarjeta y yapeo recibido)
- Parser de regex con fallback a IA para formatos no reconocidos
- Cuando detecta un ingreso (yapeo recibido), suma automáticamente a la mesada semanal
- Nunca guarda el cuerpo del correo: solo monto, fecha, destinatario y tipo

### IA (Gemini / Claude)
- Clasifica cada gasto y opina en una frase amable, sin regañar
- Genera el consejo del día con contexto real: gastos, préstamos por vencer, día de la semana
- Asistente de presupuesto: detecta si hablas de una salida específica o de la semana, y planifica diferente
- Fallback automático a plantillas de palabras clave si la IA no está disponible

### Vida social
- **Salidas con presupuesto**: crea una salida desde la sección Salidas, agrega plata extra recibida, monitorea que no te pases
- **Dividir cuenta**: partes iguales o montos personalizados, genera cobros automáticos con link de confirmación
- **Préstamos**: el amigo confirma desde un link sin crear cuenta; detección automática de pagos por Yape

### Perfil financiero
- Score 0–100 con 5 indicadores: control del gasto, ahorro, regularidad, pagar a tiempo, salidas
- Niveles gamificados: Pollito → Colibrí → Conejo → Oveja → GOAT
- La racha se calcula hacia los 18 años (basada en fecha de nacimiento)
- Al llegar a los 18: certificado compartible con banco (con consentimiento explícito)
- El perfil no es un historial crediticio formal — siempre se muestra el disclaimer

### Resumen semanal
- Al terminar la semana: análisis de dónde fue la plata, qué categorías se pasaron del tope y sugerencias concretas para la siguiente semana

### Categorías personalizables
- Ocultar las que no usas (ej. Suscripciones)
- Crear categorías propias con emoji (ej. "Merch Enhypen")

---

## Tests

```bash
cd yala-backend && npm test
# 28 pruebas: e2e completo · parser BCP/Yape · IA con mocks · split de cuenta
```

---

## Configurar Gmail OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → nuevo proyecto → habilitar **Gmail API**
2. OAuth consent screen → modo **Testing** → agregar correos del equipo como *Test users*
3. Credentials → OAuth 2.0 Client ID (Web) → redirect URIs:
   - `https://tu-backend.onrender.com/api/auth/google/callback`
   - `https://tu-backend.onrender.com/api/gmail/callback`
4. Copiar credenciales a las variables de entorno de Render

Errores comunes:
- `Error 403: access_denied` → el correo no está en la lista de Test users
- `redirect_uri_mismatch` → la URI en Google Cloud no coincide exactamente

---

## Reglas de producto (no violar)

1. No existe rol de padre/madre. Los padres solo envían dinero.
2. Los amigos se guardan solo como apodo, nunca nombre completo.
3. Nunca guardar el cuerpo de los correos.
4. Tono cercano, peruano, sin regaños.
5. Prestar más que la mesada semanal no suma puntos.
6. Que un amigo no pague no baja el puntaje.
7. La app funciona completa en modo demo, sin Gmail ni clave de IA.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · TypeScript · Express 5 · SQLite · Zod |
| Frontend | React 18 · Vite · TypeScript · React Router 6 · PWA |
| IA | Gemini 3.5 Flash Lite · Claude Haiku · fallback a plantillas |
| Auth | JWT · Google OAuth 2.0 |
| Deploy | Render (backend) · Netlify (frontend) |
| Tests | Vitest · 28 pruebas |

---

*"Yala construye la data que un banco necesita para darle a un joven su primera tarjeta."*
