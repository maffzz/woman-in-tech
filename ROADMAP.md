# **ROADMAP PARA GANAR LA HACKATÓN: MVP COMPLETO DE YALA (v2, con vida social)**

---

## **1\. QUÉ HACE GANAR UNA HACKATÓN**

| Criterio del jurado | Cómo lo cubre Yala |
| ----- | ----- |
| **Problema real** | Diana, con frases textuales de sus entrevistas |
| **Respuesta al reto** | El perfil con puntos como inicio de historial crediticio, con "devolver a tiempo" como señal estrella |
| **Funciona** | Flujo completo sin fallos y un momento real (Gmail o correo pegado) |
| **Experiencia de usuario** | Móvil primero, cero registro manual en lo que viene de Yape, tono amigable |
| **Negocio y futuro** | Vista Banco, hoja de ruta y cómo gana el banco |

**Los 5 momentos "wow" de la demo:**

1. Conectar Gmail (o pegar un correo de Yape) y ver los movimientos aparecer solos.  
2. La IA opinando un gasto y dando el consejo del día.  
3. **Salida del sábado:** presupuesto de S/ 30, barra que baja, resumen final.  
4. **Dividir la pizza y prestar:** el amigo confirma desde un enlace y Yala sugiere "pagado" al detectar el Yape.  
5. **"Simular 3 meses"** sube el nivel en vivo y Diana comparte su certificado con el banco.

---

## **2\. ARQUITECTURA: MODO DEMO Y MODO REAL**

Un interruptor en configuración alterna entre:

* **Movimientos:** demo (datos sembrados de Diana), gmail (lectura real) o pegado (correo pegado a mano).  
* **IA:** real (API de Claude desde el servidor) o cache (opiniones y consejos pregrabados).  
* **Préstamos:** enlace de confirmación real; en demo, el amigo "confirma" con un botón de simulación.  
* **Banco:** siempre simulado (certificado demo).

Si falla internet, la API o Google, cambian a demo en un clic.

**Stack:** Next.js (PWA) \+ Tailwind \+ Supabase \+ Gmail API \+ API de Claude \+ Vercel \+ Recharts.

**Seguridad desde el día 1:**

* Claves de Claude y credenciales de Google solo en variables de entorno del servidor, nunca en el navegador ni en GitHub.  
* No se guarda el cuerpo de los correos, solo monto, fecha, destinatario y tipo.  
* Los amigos se guardan solo como apodo.

---

## **3\. CRONOGRAMA DE 2 DÍAS**

**Día 1: datos, dashboard e IA**

* Hora 0-1: correos reales de Yape, repositorio, Supabase, Google Cloud, CONTEXTO.md.  
* Hora 1-3: base, datos demo (con salidas y préstamos) y dashboard.  
* Hora 3-5: IA (clasificación, opinión, consejo).  
* Hora 5-7: Gmail real o pegado.  
* Hora 7-8: prueba con 2 adolescentes y commit estable.

**Día 2: vida social, perfil y pitch**

* Hora 0-2: salidas con presupuesto y dividir cuenta.  
* Hora 2-4: préstamos, recordatorios y mensaje de cobro.  
* Hora 4-6: motor de puntaje, simulador, perfil, vista Banco y privacidad.  
* Hora 6-7: pulido, modo Presentación, ensayo y plan B.  
* Hora 7-8: pitch y video de respaldo. **Congelar cambios 2 horas antes de presentar.**

---

## **4\. PROMPTS EN ORDEN**

### **Paso 0: contexto (pegar al inicio de CADA sesión)**

```
Estamos construyendo "Yala", una app web móvil (PWA) para adolescentes
peruanos de 15 a 17 años. Lee sus correos de Yape (solo esos) para mostrar
en qué gastan; una IA clasifica cada gasto, opina y da un consejo del día;
ayuda a gestionar salidas con amigos (presupuesto, dividir cuenta,
préstamos, devolver a tiempo y cobrar sin incomodidad); y arma un perfil
con puntos que es el inicio de su historial crediticio, que a los 18 años
pueden compartir con un banco.
Reglas: los padres NO participan (solo dan el dinero). Tono amigable,
nunca regañar. Mobile-first. Persona: Diana, 16 años, recibe S/ 60
semanales por Yape. Stack: Next.js, Tailwind, Supabase, Recharts, API de
Claude llamada solo desde el servidor. No guardar el cuerpo de correos,
solo monto, fecha, destinatario y tipo. Los amigos se guardan solo como
apodo. Cada fuente de datos tiene modo "demo" y modo "real".
```

### **Paso 1: base y adaptadores de datos**

```
Crea un proyecto Next.js con Tailwind y Supabase (auth con Google).
Estructura el código con una capa "fuentes de datos" con una misma
interfaz getMovimientos() y tres implementaciones: demo, gmail y pegado.
Agrega una pantalla de configuración con el interruptor "Modo de datos".
Crea las tablas: usuarios, movimientos (fecha, monto, tipo, destinatario,
categoria, opinion_ia, origen, id_correo único), salidas (nombre, fecha,
presupuesto, gasto_total, estado), prestamos (apodo, monto, direccion,
fecha_acordada, fecha_pago, a_tiempo, confirmado, movimiento_id, token
único), consejos, perfil_historial (con version del calculo),
consentimientos. Activa seguridad por filas para que cada usuario vea solo
lo suyo.
```

### **Paso 2: datos de demo realistas**

```
Crea un script de siembra con 3 meses de movimientos de Diana (16 años,
recibe S/ 60 cada lunes por Yape de su mamá): snacks (S/ 3-8), recargas
(S/ 5-10), juegos (S/ 10-30 con un pico a S/ 90 un mes), transporte y
salidas con amigas los fines de semana. Incluye tres salidas con
presupuesto (una dentro, una justa y una pasada por S/ 8) y tres
préstamos: uno que ella devolvió a tiempo, uno que devolvió tarde y uno
que le deben a ella con un recordatorio enviado. Que el control del gasto
mejore mes a mes. Agrega el botón "Cargar datos de demo".
```

### **Paso 3: dashboard**

```
Pantalla de inicio móvil con: tarjeta del consejo del día, total gastado
del mes, dona por categoría, barras contra el mes anterior, tarjeta
"Juegos y entretenimiento" con alerta suave si sube más de 30 %, una
tarjeta "Social" con cuánto debe y cuánto le deben, y movimientos
recientes. Tono cálido, nada de banco, botones grandes y navegación
inferior.
```

### **Paso 4: clasificación y opinión con IA**

```
Ruta de servidor que reciba un movimiento y el contexto del mes y llame a
la API de Claude para devolver JSON { categoria, opinion }. Categorías:
comida, transporte, juegos, entretenimiento, recargas, salidas, ahorro,
otros. La opinión es de una frase, amable, y dice si parece razonable o se
repite demasiado, sin regañar. Valida el JSON, reintenta una vez si falla
y no repitas llamadas si ya existe resultado. Permite corregir la
categoría y guarda una regla por destinatario que se aplique antes de
llamar a la IA. Agrega modo "cache" con opiniones pregrabadas.
```

### **Paso 5: consejo del día**

```
Genera cada día un consejo de máximo 2 frases con: gastos de los últimos
14 días, día de la semana, porcentaje gastado de la semana, préstamos por
vencer o por cobrar y consejos de los últimos 7 días para no repetirlos.
Concreto, con montos en soles, amistoso, nunca regañar. Ejemplo: "Hoy es
viernes y ya usaste el 70 % de tu semana. Y mañana vence lo que le debes a
Ana: yapéale antes y sumas puntos". Cachea uno por usuario por día. En
modo demo usa 7 consejos pregrabados.
```

### **Paso 6: salidas con amigos**

```
Pantalla "Mis salidas": crear una salida con nombre, fecha, franja
horaria y presupuesto (ej. S/ 30 el sábado de 3 a 10 pm). Asocia
automáticamente los gastos de Yape de esa franja y deja que el usuario
agregue o quite movimientos. Muestra con una barra cuánto va y cuánto
queda. Si se pasa, aviso amable ("te pasaste por S/ 8, pasa; así sabes
para la próxima"). Al terminar, resumen: "Saliste con S/ 30 y gastaste
S/ 24, dentro de tu presupuesto". Guarda el resultado para el puntaje.
```

### **Paso 7: dividir la cuenta**

```
Pantalla "Dividir cuenta": total, quién pagó y apodos de los amigos.
Opciones: partes iguales o montos distintos. Calcula cuánto le toca a cada
uno y crea un préstamo por cada parte pendiente que le deban a la persona
que pagó. Muestra un botón "Copiar mensaje" con un texto amable para
WhatsApp, por ejemplo: "Hola Mateo, ¿me yapeas los S/ 10 de la pizza?
Gracias". Si el usuario es quien debe, crea el préstamo en "Debo".
```

### **Paso 8: préstamos, devolver a tiempo y cobrar**

```
Pantalla de préstamos con pestañas "Debo" y "Me deben". Cada uno tiene
monto, apodo, fecha de devolución y estado. Genera un enlace único para
que el amigo confirme sin crear cuenta (solo ve monto y un botón
"Confirmar"). Si en los movimientos aparece un Yape a esa persona por ese
monto, sugiere marcar como pagado y guarda si fue a tiempo. Si pagó en
efectivo, el amigo confirma desde el enlace. Envía recordatorios amables
2 días y 1 día antes del vencimiento. Para lo que le deben, ofrece un
mensaje de cobro amable listo para copiar. Registra cuándo se cobró y
cuándo se cerró. En modo demo, agrega un botón "Simular que Mateo
confirma".
```

### **Paso 9: Gmail real (solo correos de Yape)**

```
Botón "Conectar mi Gmail" con OAuth de Google y permiso gmail.readonly.
Busca únicamente mensajes del remitente de Yape (variable de entorno
YAPE_REMITENTE). Para cada mensaje nuevo extrae monto, fecha, destinatario
y tipo (gasto/ingreso) con un parser por expresiones regulares; si falla,
usa la API de Claude como respaldo y devuelve JSON. Evita duplicados con el
ID del mensaje. NO guardes el cuerpo del correo. Guarda los correos no
interpretados en una tabla aparte, solo con ID y motivo. Botón
"Sincronizar ahora" que muestre cuántos movimientos entraron. Maneja
permiso revocado, token vencido y bandeja sin correos.
```

### **Paso 10: modo "pegar correo" (plan B)**

```
Pantalla "Pegar un correo de Yape": un cuadro de texto donde el usuario
pega el contenido, se procesa con el mismo parser y aparece un movimiento
nuevo con animación. Permite pegar varios correos separados por una línea.
No guardes el texto pegado.
```

### **Paso 11: motor de puntaje y simulador**

```
Crea el motor de puntaje como módulo independiente y versionado (v1).
Entradas: movimientos, salidas y préstamos de los últimos 3 meses.
Pesos: control del gasto 25 %, ahorro estimado (ingresos menos gastos)
20 %, regularidad y gasto razonable en juegos y entretenimiento 20 %,
devolución a tiempo 20 %, salidas dentro del presupuesto y gestión de
cobros 15 %. Si no hay préstamos o salidas, redistribuye los pesos. Reglas:
prestar mucho no suma (tope respecto a su dinero semanal), que un amigo no
pague NO resta, el puntaje solo cuenta con mínimo 4 semanas de datos.
Salida: puntaje 0 a 100, nivel (Inicial, Constante, Confiable, Sólido) y
una explicación de una frase por indicador. Guarda cada cálculo con su
versión y agrega pruebas automáticas con 4 perfiles de ejemplo.
```

```
Pantalla "Mi perfil": puntaje grande con animación, nivel, barra hacia el
siguiente nivel, indicadores con una frase cada uno y una sección "¿Cómo
mejoro?" con 2 sugerencias basadas en sus datos. Agrega un botón
"Simular 3 meses" que avance el tiempo con datos de demo y muestre
la subida de nivel con animación, marcado claramente como simulación.
```

### **Paso 12: vista Banco y certificado**

```
Pantalla "Compartir mi perfil a los 18 años": explica qué se comparte
(nivel, meses de historial, indicadores) y qué no (movimientos,
destinatarios ni nombres de amigos). Con un interruptor de consentimiento
genera un certificado con código único y enlace de verificación que
expira. Agrega una vista "Banco (simulación)" en otra ruta que abre el
certificado con la nota "Dato de apoyo, no es un historial crediticio
formal". En el MVP permite generarlo con una fecha de nacimiento
simulada de 18 años, marcado como demostración.
```

### **Paso 13: privacidad**

```
Pantalla "Mis datos y privacidad": qué se lee del correo, qué se guarda,
botón para desconectar Gmail, para exportar mis datos y para borrar todo
definitivamente. Registra cada consentimiento con fecha y versión del
texto. Onboarding de 3 pantallas en lenguaje simple antes de conectar el
correo.
```

### **Paso 14: pulido y modo Presentación**

```
Revisa toda la app en pantalla de celular: botones grandes, textos cortos,
esqueletos de carga, estados vacíos amistosos, errores claros, animaciones
suaves y un logo simple de 2 colores. Agrega un modo "Presentación" que
oculte la configuración y siembre los datos de Diana con un clic.
```

---

## **5\. GMAIL REAL: LO QUE DEBEN SABER**

**Configuración (Persona A, primera hora):**

1. Crear proyecto en Google Cloud y habilitar la **Gmail API**.  
2. Configurar la pantalla de consentimiento OAuth en modo **Testing** y agregar como usuarios de prueba los correos que usarán en la demo.  
3. Crear credenciales OAuth y las URL de redirección (local y de Vercel).  
4. Guardar las credenciales como variables de entorno.

**Advertencias:**

* Leer Gmail es un permiso **restringido**. En modo de prueba funciona para usuarios agregados manualmente, pero verifiquen en la documentación vigente de Google los límites y cuánto duran las sesiones. **Reconecten la cuenta el día de la demo.**  
* Para uso público Google exige verificación y evaluación de seguridad. No es del MVP, pero deben mencionarlo en el pitch como parte de la hoja de ruta.  
* **Todo depende del formato real de los correos de Yape.** No puedo asegurarles qué remitente ni qué campos traen. Consigan 3 a 5 correos reales con datos tapados y usen este prompt:

```
Te paso 3 correos de Yape con datos tapados. Identifica el remitente, los
campos que se pueden extraer (monto, fecha, destinatario, tipo de
operación) y propón un parser robusto. Dime qué casos no se pueden
distinguir, por ejemplo si un pago es una devolución de préstamo.
```

* Si los correos no traen lo necesario, el modo "pegar correo" y el modo demo cubren la demostración.

---

## **6\. LO QUE DEBEN DECIR CON HONESTIDAD**

Un jurado con experiencia lo valora:

* El perfil **no es un historial crediticio formal**: es el inicio de uno y un dato de apoyo.  
* El ahorro se **estima**, y la devolución a tiempo sale del **registro de préstamos cruzado con Yape**, porque el correo no dice si un pago es una devolución.  
* **No se premia prestar más** y que un amigo no pague no baja el puntaje.  
* El banco aún no validó el perfil: el siguiente paso es un piloto.  
* Una tarjeta de crédito exige 18 años; el perfil se comparte solo al cumplirlos y con consentimiento.  
* Los amigos son menores: solo se guarda el apodo y no aparecen en el certificado.

---

## **7\. GUION DE DEMO DE 3 MINUTOS**

1. **Diana (20 s):** "Recibe S/ 60 por Yape cada semana, no sabe en qué se le va y le da roche cobrar lo que prestó. Los bancos tampoco la conocen: a los 18 es invisible."  
2. **Conexión (25 s):** conecta Gmail (o pega un correo) y aparecen los movimientos.  
3. **Dashboard e IA (30 s):** la IA opina que lo de juegos subió y le pregunta si vale la pena.  
4. **Consejo del día (10 s).**  
5. **Salida del sábado (30 s):** presupuesto de S/ 30, barra bajando, resumen "dentro del presupuesto".  
6. **Dividir y prestar (35 s):** divide la pizza, Mateo confirma desde el enlace, Yala detecta el Yape de Diana a Ana y sugiere "pagado a tiempo".  
7. **Simular 3 meses \+ perfil (20 s):** de Inicial a Constante, con "¿por qué tengo este puntaje?".  
8. **Banco (20 s):** Diana cumple 18, activa el consentimiento y el banco ve el certificado.  
9. **Cierre (10 s):** "Yala construye la data que un banco necesita para darle a un joven su primera tarjeta."

---

## **8\. PLAN B (ensáyenlo)**

* **Gmail falla:** cambien a "pegar correo" o a modo demo sin comentarlo.  
* **La IA no responde:** el modo cache muestra opiniones y consejos pregrabados.  
* **Un amigo no puede confirmar el enlace en vivo:** usen "Simular que Mateo confirma".  
* **No hay internet:** video de la demo grabado y app corriendo en local.  
* **Se rompe algo:** vuelvan al último commit estable. Congelen cambios 2 horas antes.

---

## **9\. SI SE ACORTA EL TIEMPO (orden de prioridad)**

1. Dashboard con datos de demo.  
2. Clasificación y consejo con IA.  
3. Préstamos con confirmación y salidas con presupuesto.  
4. Perfil con puntos y simulador.  
5. Vista Banco.  
6. Dividir cuenta.  
7. Gmail real.  
8. Privacidad.

---

## **10\. CHECKLIST FINAL**

* Modo demo y modo real alternan en un clic.  
* Datos de Diana sembrados, con salidas y préstamos.  
* Gmail real probado el mismo día con una cuenta de prueba reconectada.  
* Opiniones y consejos pregrabados de respaldo.  
* Salida, dividir cuenta y préstamo funcionan de punta a punta.  
* Simulador de meses probado.  
* Certificado y vista Banco funcionando.  
* Pantalla de privacidad lista.  
* Video de respaldo grabado.  
* Al menos 2 adolescentes probaron la app y tienen una frase textual para el pitch.  
* Todos saben decir los límites con honestidad.