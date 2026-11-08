# Prompt

Trabajo en **Yala**, app peruana de hackathon para adolescentes (≈15–17 años) que reciben dinero por Yape. Este repositorio tiene dos carpetas:
- `yala-backend/` — API REST (Node 22, TypeScript, Express, SQLite). Contrato en `yala-backend/API.md`.
- `yala-frontend/` — App React + Vite + TypeScript (móvil-first, fondo blanco, mascota GOAT con niveles Huevo→Pollo→Gallo→Chivo→GOAT). Ya está conectada al backend a través de `src/api/yala.ts`.

## Qué es Yala
Lee SOLO los correos de Yape del Gmail del usuario (solo lectura). La IA categoriza cada gasto, opina breve y amable y da un "consejo del día". El usuario pone topes semanales por sección (comida, transporte, salidas, suscripciones) y gana racha por cada semana dentro del presupuesto (sube de nivel). Los puntos son el inicio de un historial financiero que, con consentimiento y a los 18, puede compartirse con un banco. Vida social: presupuesto por salida, dividir cuentas, préstamos entre amigos confirmados por link, premio por devolver a tiempo, mensajes amables de cobro.

## Reglas de producto (no las violes)
1. **No existe rol de padre/madre**: los padres solo envían dinero. Sin aprobación, supervisión ni vista.
2. **Amigos = solo apodo**. Nunca nombres completos ni contactos.
3. **Nunca guardar el cuerpo de los correos**: solo monto, fecha, destinatario y tipo.
4. Tono cercano, peruano, **sin regaños**. Sin retos/challenges (en la UI el bloque morado es "Consejo del día").
5. Prestar más que tu presupuesto semanal no suma puntos; que un amigo no pague NO baja el puntaje.
6. El perfil **no es historial crediticio formal**: muestra siempre el disclaimer de `/profile`. Certificado a banco solo con consentimiento explícito y 18+ (excepción solo demo).
7. Debe funcionar completo en modo demo, sin Gmail ni API key de IA.

## Tu tarea
1. Lee `yala-backend/README.md`, `yala-backend/API.md` y `yala-frontend/README.md`. Luego recorre `yala-backend/src/routes`, `src/services` y `yala-frontend/src`. Resúmeme la arquitectura en 10 líneas antes de editar.
2. Instala y corre ambos (`npm install && npm run dev` en cada carpeta; copia los `.env.example` a `.env`). Corre `npm test` en el backend y `npm run build` en el frontend. Arregla lo que falle.
3. Recorre el flujo en el navegador: Entrar como Diana → Inicio → Secciones (añadir gasto, ajustar tope) → Asistente (aplicar plan) → Amigos (nueva salida, dividir cuenta, recordar préstamo) → Perfil (Simular 3 meses, generar código de banco) → abrir `/banco/<código>` → Conectar (pegar un correo de Yape). Reporta cualquier pantalla rota o dato que no cuadre.
4. Pendiente real que sí debes hacer conmigo:
   - **Formato del correo de Yape sin confirmar**: cuando te dé 3–5 correos reales, ajusta `yala-backend/src/services/yapeParser.ts` y agrégalos como fixtures en `tests/parser.test.ts`.
   - Configurar Gmail OAuth (Google Cloud, modo *Testing*, solo `gmail.readonly`) siguiendo `yala-backend/README.md`.
   - Opcional: conectar el asistente (`POST /assistant/plan`) a Claude con `ANTHROPIC_API_KEY` (hoy usa reglas simples).
   - Ajustar los umbrales de niveles en `yala-backend/src/services/levels.ts` si el equipo los cambia.
6. Antes de producción: cambiar `JWT_SECRET` y `ENCRYPTION_KEY`, `ALLOW_DEV_LOGIN=false`, HTTPS, y `FRONTEND_URL` con el dominio real.

## No hagas
No inventes endpoints sin avisar, no agregues rol de padres, no guardes datos sensibles en el frontend, no expongas claves, no uses nombres reales de amigos en ejemplos.

Al terminar dame: resumen de cambios, qué probaste, qué sigue pendiente.
