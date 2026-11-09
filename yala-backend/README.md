# Yala — Backend base

API REST (Node 22 + TypeScript + Express + SQLite) para la app Yala. Independiente del framework del frontend.

## Arranque
```bash
cp .env.example .env   # luego edita .env con tus claves reales
npm install
npm run dev          # http://localhost:4000/api
npm test             # 26 pruebas
npm run typecheck
```
Prueba rápida: `curl -X POST localhost:4000/api/auth/demo` devuelve `{token,user}` de Sofia Zuñiga con datos de demo.

## Modos
- **Datos**: `demo` (datos sembrados) · `pegado` (el usuario pega el correo de Yape/BCP) · `gmail` (lectura real, solo lectura).
- **IA**: `AI_MODE=auto` usa la IA real si hay clave; si no, plantillas/palabras clave (sin romper la demo). `cache` fuerza plantillas.
- **Demo**: `POST /api/demo/simulate-months` adelanta el reloj 3 meses y muestra antes/después del perfil.

## Proveedor de IA

Puedes elegir entre **Claude (Anthropic)** o **Gemini (Google)**. Se controla con la variable `AI_PROVIDER` en `.env`:

| Variable | Valor | Descripción |
|---|---|---|
| `AI_PROVIDER` | `claude` (default) o `gemini` | Proveedor activo |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Clave de Claude (si usas claude) |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | Modelo de Claude |
| `GEMINI_API_KEY` | `AIza...` | Clave de Gemini (si usas gemini) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Modelo de Gemini recomendado |

Si el proveedor falla (429, 5xx, timeout, JSON inválido), el sistema usa automáticamente las plantillas de palabras clave como respaldo. Hay un reintento automático y un límite de 2 llamadas concurrentes para no reventar el cupo gratuito.

> **Nota de privacidad (Gemini):** El plan gratuito de la API de Gemini puede usar las conversaciones para mejorar productos de Google ([ver política](https://ai.google.dev/gemini-api/terms)). Por eso, en producción con datos reales de usuarios se recomienda usar Claude o el plan de pago de Gemini. Para la demo (datos ficticios de Sofia) no hay problema.

## Remitentes aceptados (Yape + BCP)

`YAPE_SENDER` acepta varios remitentes separados por coma:
```
YAPE_SENDER=notificaciones@yape.com.pe,notificaciones@notificacionesbcp.com.pe
```
El parser soporta el formato de correos BCP ("Realizaste un consumo de S/ X con tu Tarjeta de Débito BCP en COMERCIO") y el formato Yape ("¡Yapeaste S/ X! Destinatario: ...").

## Gmail real
1. Google Cloud → habilita Gmail API → pantalla de consentimiento en modo *Testing* y agrega como *test users* a tu equipo.
2. Credenciales OAuth (Web) con redirect `http://localhost:4000/api/gmail/callback` y `/api/auth/google/callback`.
3. Llena `GOOGLE_CLIENT_ID/SECRET` en `.env`. Scope: solo `gmail.readonly`; se filtra por `YAPE_SENDER`.
4. Solo se guarda monto, fecha, destinatario y tipo. **Nunca el cuerpo del correo.** Token de refresco cifrado (AES-256-GCM).

## Errores comunes de Google OAuth

| Error | Causa | Solución |
|---|---|---|
| `redirect_uri_mismatch` | La URI en Google Cloud no coincide | Ve a APIs & Services → Credentials → tu cliente OAuth → Authorized redirect URIs. Agrega exactamente `http://localhost:4000/api/gmail/callback` y `http://localhost:4000/api/auth/google/callback` |
| `access_denied` | Tu correo no está en Test Users | Ve a OAuth consent screen → Test users → agrega tu correo |
| `invalid_client` | Credenciales incorrectas | Verifica `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env` |
| `configured: false` en `/gmail/status` | `GOOGLE_CLIENT_ID` vacío en `.env` | Copia las claves de Google Cloud a `.env` (no a `.env.example`) |

## Pendientes / honestidad
- **El formato real del correo de Yape no está confirmado.** El parser soporta BCP (confirmado) y Yape (asumido). Ajustar con correos reales de Yape si se consiguen.
- Para usuarios fuera de tu lista de prueba, Google exige verificación del scope restringido de Gmail (semanas). Para el hackathon: modo Testing o modo pegado.
- El perfil **no es un historial crediticio formal**; es un perfil de hábitos compartido con consentimiento. Los certificados con banco requieren 18+ (excepción solo en demo, `ALLOW_DEMO_CERT`).
- Datos de menores: valida consentimiento parental/legal con asesoría antes de operar de verdad.
- Antes de producción: cambiar `JWT_SECRET` y `ENCRYPTION_KEY`, poner `ALLOW_DEV_LOGIN=false`, HTTPS.

## Estructura
`src/routes/*` endpoints · `src/services/*` lógica (parser, ia, scoring, gmail, demo) · `src/db.ts` esquema SQLite · `API.md` contrato.
