# Contrato de la API (base: `/api`)

Auth: `Authorization: Bearer <token>` salvo rutas `public`. Errores: `{ "error": "texto", "code": "slug", "details"? }`. Fechas ISO 8601 (UTC). Montos en soles (número). Categorías: `comida, transporte, juegos, entretenimiento, recargas, salidas, suscripciones, ahorro, otros`.

## Auth / usuario
| Método | Ruta | Notas |
|---|---|---|
| POST | /auth/demo | `?reset=true` re-siembra. → `{token,user}` |
| POST | /auth/dev-login | `{email,name,birthDate?,weeklyAllowance?}` (solo dev) |
| GET | /auth/google/url | → `{url}` (login Google) · callback redirige al front con `?token=` |
| GET | /me | `{id,email,name,birthDate,age,weeklyAllowance,dataMode,isDemo}` |
| PATCH | /me | `{name?,birthDate?,weeklyAllowance?,dataMode?}` |

## Movimientos
| GET | /movements | `from,to,category,type,limit,offset` → `{items:[Movement]}` |
|---|---|---|
| POST | /movements | `{amount,type?,counterparty?,category?,occurredAt?}` |
| POST | /movements/paste | `{text}` → `{imported,duplicates,unparsed,items}` |
| PATCH | /movements/:id/category | `{category,applyToSame?}` (aprende regla por destinatario) |
| POST | /movements/:id/opinion | recalcula opinión IA |
| DELETE | /movements/:id | 204 |

`Movement = {id,occurredAt,amount,type:'expense'|'income',counterparty,category,aiOpinion,origin,verified,categoryCorrected}`

## Gmail
GET /gmail/status → `{configured,connected,connectedAt,lastSyncAt,unparsedEmails,senderFilter}` · GET /gmail/connect-url → `{url}` · POST /gmail/sync → `{found,imported,duplicates,unparsed}` · DELETE /gmail (desconecta y borra token).

## Dashboard y consejo
GET /dashboard → `{month,totals:{expenses,income,prevExpenses},byCategory:[{category,amount,prevAmount}],week:{spent,allowance,pct},hormiga:{count,total,topCounterparty},social:{openOuting,owedToMe,iOwe,nextDue},recent:[Movement],advice:{day,text,source},profile:{score,level,provisional,monthsOfHistory}}`
GET /advice/today (`?refresh=true`).

## Salidas
POST /outings `{name,budget,startsAt?,endsAt?}` · GET /outings · GET /outings/:id (con `movements`, `spent`, `remaining`, `progressPct`, `loans`) · POST /outings/:id/movements `{movementId}` · DELETE /outings/:id/movements/:mid · POST /outings/:id/finish.

## Dividir cuenta
POST /split `{total,mode:'equal'|'custom',people:[{nickname,amount?}],concept?,dueDays?,outingId?}` → `{total,myShare,shares:[{nickname,amount,loan,whatsappText}]}`. Equitativo incluye a quien pagó.

## Préstamos (solo apodos)
POST /loans `{friendNickname,amount,direction:'lent'|'borrowed',concept?,dueDate?}` · GET /loans `?status=pending|paid|all` · GET /loans/suggestions (pagos Yape que parecen saldar un préstamo) · PATCH /loans/:id · DELETE /loans/:id · POST /loans/:id/remind → `{message,link,loan}` (mensaje amable) · POST /loans/:id/pay `{method:'yape'|'cash',movementId?}` · POST /loans/:id/simulate-confirm (demo).
`Loan = {id,friendNickname,amount,direction,concept,createdAt,dueDate,paidAt,paidMethod,onTime,confirmedByFriend,remindedAt,movementId,outingId,status:'pending'|'overdue'|'paid',confirmLink}`
Público: GET /public/loans/:token · POST /public/loans/:token/confirm.

## Perfil
GET /profile → `{version,score,level:'Inicial'|'Constante'|'Confiable'|'Sólido',provisional,weeksOfData,monthsOfHistory,nextLevel,indicators:[{key,label,score,...}],tips,disclaimer}` · GET /profile/history.

## Demo (solo cuenta demo)
POST /demo/reset · POST /demo/simulate-months → `{before,after,user}`.

## Certificado para el banco
POST /certificates `{consent:true}` (18+ o demo) → `{code,expiresAt,payload,shareUrl}` · GET /certificates · DELETE /certificates/:code (revoca) · Público: GET /public/certificates/:code (solo nivel, meses, indicadores; 410 si venció/revocado).

## Privacidad
GET/POST /privacy/consents · GET /privacy/export · DELETE /privacy/data `{confirm:'ELIMINAR'}` · GET /health.

## Topes, asistente y niveles (pantallas Secciones / Asistente / Niveles)
- GET /budgets → `{weeklyAllowance,savingsGoal,items:[{category,label,weeklyCap,spent,remaining,pct,today,hormiga,level:'none'|'ok'|'warn'|'over'}]}`. Si el usuario no eligió topes, se usa el plan por defecto sobre su mesada. `warn` ≥ 80 %, `over` ≥ 100 %.
- PUT /budgets `{category,weeklyAmount}`.
- POST /assistant/plan `{message,weeklyAmount?}` → `{weekly,items:[{category,label,pct,amount}],reply,footnote}` (reglas simples; punto de enchufe para Claude).
- POST /assistant/apply `{weekly?,items:[{category,amount}]}` guarda los topes y la mesada.
- GET /levels → `{streakWeeks,goatWeeks,weeksToGoat,savingsMet,level,levelNumber,levels:[{key:'huevo|pollo|gallo|chivo|goat',name,hint,status:'done|current|locked'}],nextLevel}`. Racha = semanas móviles seguidas con gasto ≤ mesada. Pollo 1, Gallo 3, Chivo 6, GOAT 10 + ahorro cumplido (números propuestos, editables en `src/services/levels.ts`).
- GET /dashboard ahora incluye `hormiga.weekTotal`, `hormiga.daily[7]`, `savings:{goal,weeks[7],thisWeek}` y `level:{name,number,streakWeeks,weeksToGoat,goatWeeks}`.
