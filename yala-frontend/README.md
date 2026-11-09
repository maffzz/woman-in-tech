# Yala — Frontend (React + Vite + TypeScript)

App móvil-first con la vista elegida: fondo blanco + mascota GOAT (Huevo → Pollo → Gallo → Chivo → GOAT). Ya viene conectada al backend de `../yala-backend`.

## Arranque
```bash
# 1) Backend (otra terminal)
cd ../yala-backend && cp .env.example .env && npm install && npm run dev      # http://localhost:4000/api
# 2) Frontend
cp .env.example .env     # VITE_API_URL=http://localhost:4000/api
npm install && npm run dev                                                    # http://localhost:5173
```
Entra con **"Entrar como Sofia (demo)"**: no necesita Gmail ni API key. En `yala-backend/.env`, `FRONTEND_URL` debe ser la URL del front (por defecto `http://localhost:5173`).

## Pantallas
| Ruta | Qué es | Endpoints |
|---|---|---|
| `/` Inicio | mascota, racha, consejo del día, hormigas, ahorro, "te quedan por sección" | `/dashboard`, `/budgets` |
| `/secciones?c=comida` | dona vs. tope, + gasto, ajustar tope, mover de categoría | `/budgets`, `/movements`, `/movements/:id/category` |
| `/asistente` | plan de plata (chat) | `/assistant/plan`, `/assistant/apply` |
| `/niveles` | evolución huevo→GOAT | `/levels` |
| `/amigos` | salidas con presupuesto, préstamos, dividir cuenta | `/outings`, `/loans`, `/split` |
| `/perfil` | perfil de hábitos, simular 3 meses (demo), certificado para el banco, privacidad | `/profile`, `/demo/*`, `/certificates`, `/privacy/*` |
| `/conectar` | Gmail solo lectura o pegar correo de Yape | `/gmail/*`, `/movements/paste` |
| `/p/:token` (pública) | el amigo confirma un préstamo (solo apodo) | `/public/loans/:token` |
| `/banco/:code` (pública) | vista del banco (nivel, meses, indicadores) | `/public/certificates/:code` |

## Dónde tocar
- `src/api/yala.ts`: **todas** las llamadas y tipos (único lugar que conoce el backend).
- `src/components/Mascot.tsx`: los 5 dibujos SVG de la mascota.
- `src/styles.css`: paleta (variables en `:root`).
- `src/pages/*`: una por pantalla.

## Notas
- "Reto del día" del diseño aparece como **"Consejo del día"** (el backend entrega el consejo; los retos/challenges se descartaron para diferenciarse). Cambia el texto en `pages/Home.tsx` si prefieres.
- Para publicar: `npm run build` y sube `dist/` (Vercel/Netlify) con `VITE_API_URL` apuntando al backend desplegado; agrega esa URL en `FRONTEND_URL` del backend. Para rutas como `/banco/:code` configura el redirect SPA a `index.html`.
