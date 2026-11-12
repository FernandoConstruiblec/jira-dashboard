# Dashboard de seguimiento: KMS (SGCC) y Prototipo (CSE)

Consulta los dos proyectos de Jira por API REST y muestra el avance del equipo en cuatro vistas:

| Vista | Qué muestra |
|---|---|
| **Avance global** | Consolidado de ambos proyectos, con pestañas para ver solo KMS o solo Prototipo. Avance ponderado por duración de épicos, % de actividades completadas, distribución por estado, comparación entre proyectos, resumen por proyecto y tabla de épicos. |
| **Sprints** | Sprints de ambos proyectos: comprometidas, arrastradas, agregadas y retiradas; estados al cierre; avance y cumplimiento del compromiso; detalle por sprint. |
| **Personas** | Carga y avance por responsable (Assignee), separados por proyecto, con la fila *Sin asignar*. |
| **Configuración** | Mapeo de estados, alcance, avisos de calidad de datos y épicos sin duración. |

Los filtros (proyecto, sprint, persona, estado, épico) viven en la URL, así que una vista filtrada se puede compartir con un enlace.

## Arquitectura

Es **un solo servicio**: un proceso NestJS sirve la API en `/api` y el dashboard compilado en el resto de rutas, en el mismo dominio. Se despliega en un único lugar, sin CORS ni URLs cruzadas.

```
backend/   NestJS. Único componente que habla con Jira. Descarga, normaliza y
           entrega un snapshot (GET /api/snapshot), con caché en memoria.
           En producción también sirve frontend/dist.
frontend/  React + Vite. Recibe el snapshot y calcula todo en el navegador con
           funciones puras (src/domain), probadas con Vitest.
```

El token de Jira nunca llega al navegador. No hay base de datos.

Endpoints de Jira que usa el backend:

- `POST /rest/api/3/search/jql`: incidencias de cada proyecto.
- `GET /rest/agile/1.0/board/{id}/sprint`: sprints de cada tablero.
- `GET /rest/api/3/project/{key}/statuses`: estados del flujo, para revisar el mapeo.
- `POST /rest/api/3/changelog/bulkfetch`: historial de estado y sprint. Atlassian lo marca como experimental; si falla, se usa `GET /rest/api/3/issue/{key}/changelog` y, si eso también falla, la vista de sprints pasa a modo aproximado y lo avisa.

## Puesta en marcha

Requisitos: Node 20 o superior. Todos los comandos se ejecutan en la raíz del repositorio.

```bash
cp backend/.env.example backend/.env   # completar JIRA_EMAIL y JIRA_API_TOKEN
npm run install:all
```

**Como en producción** (un solo proceso):

```bash
npm run build
npm start                    # http://localhost:3100  (dashboard y API)
```

**Desarrollo** (recarga en caliente; dos terminales):

```bash
npm run dev:api              # API en http://localhost:3100/api
npm run dev:web              # dashboard en http://localhost:5174 (redirige /api a la API)
```

El token se crea en <https://id.atlassian.com/manage-profile/security/api-tokens>. Conviene usar una cuenta de servicio con permiso de lectura sobre CSE y SGCC.

### Sin conexión a Jira

Si defines `JIRA_DUMP_DIR=./dumps/hoy`, cada descarga real se guarda en esa carpeta. Después puedes arrancar con `JIRA_FIXTURE_DIR=./dumps/hoy` y el backend sirve esos archivos sin consultar Jira, lo que sirve para reproducir un problema o desarrollar sin red. Las carpetas `fixtures/` y `dumps/` están en `.gitignore` porque contienen datos internos.

## Configuración (`backend/dashboard.config.json`)

Se relee en cada actualización de datos; no hace falta reiniciar.

| Clave | Uso |
|---|---|
| `projects[]` | Clave de Jira, etiqueta, tablero (`boardId`). `excludeEpics` deja fuera épicos y todo lo que cuelga de ellos (hoy, los 9 épicos IoT del Prototipo). `excludeSprintPattern` excluye sprints por nombre (hoy, `IoT`). |
| `statusMap` | **ID de estado de Jira → categoría** (`POR_HACER`, `EN_CURSO`, `EN_REVISION`, `VALIDACION_TECNICA`, `COMPLETADA`). Un estado que no esté aquí aparece como *Estado sin mapear* y genera un aviso; nunca se asigna a una categoría por defecto. |
| `hideEmptyCategories` | Categorías que no se muestran mientras no tengan actividades. Validación técnica está aquí porque el equipo no usa ese estado. |
| `fields` | IDs de los campos Sprint y Fecha de inicio en este sitio de Jira. |
| `duration` | `businessDays` (lunes a viernes) o `calendarDays`, y los feriados a descontar como `{ "date": "AAAA-MM-DD", "name": "…" }`. Ya incluye los feriados nacionales de Ecuador 2026 y 2027 en la fecha en que se descansan (con traslados), más los días decretados (2-ene-2026 y 20-nov-2026). Fuente: calendario del Viceministerio de Turismo. Hay que agregar cada año los días que el Ejecutivo decrete. |
| `people[]` | Equipo: `accountId`, nombre, rol y `focus` (personas destacadas en la vista por persona). |

Para obtener el ID de un estado nuevo: la pantalla **Configuración** lista todos los estados de cada flujo con su ID.

## Reglas de cálculo

**Unidad de ejecución (UE).** Es lo que se cuenta. Si una historia, tarea o error tiene subtareas, las UE son las subtareas y el padre no cuenta; si no tiene, la UE es la propia incidencia. Los épicos nunca son UE. Una subtarea hereda el épico y el sprint de su padre.

**Dos indicadores distintos, nunca intercambiables:**

- *% de actividades completadas* = UE completadas / UE totales.
- *Avance ponderado* = Σ peso de UE completadas / Σ peso de la selección × 100, con peso(UE) = duración del épico / nº de UE del épico. La duración sale de *Fecha de inicio* y *Fecha de vencimiento* del épico. Es una **ponderación provisional**, porque no hay estimaciones individuales.

**Casos límite del avance ponderado:**

- Un épico sin fechas (o con fechas invertidas) queda fuera y se lista como *Sin duración planificada*.
- Un épico con fechas pero sin historias pesa su duración completa con 0 % (*Pendiente de descomposición*).
- Las UE sin épico se cuentan en las cantidades, pero no tienen peso.
- Con filtro de persona o sprint, el peso de cada UE se sigue calculando sobre el épico completo; el filtro solo elige qué UE se suman.
- Con filtro de estado, el porcentaje no aplica y se indica.

**Sprints.** Avance = completadas / alcance del sprint. Con historial de Jira se reconstruye la pertenencia y el estado de cada UE en el inicio y el cierre:

- *Comprometida*: estaba en el sprint al iniciarlo.
- *Arrastrada*: entró después del inicio porque Jira la movió al cerrar el sprint anterior (pasó con el KMS Sprint 1 → 2, que se cerró después de abrir el siguiente). Cuenta como parte del compromiso.
- *Agregada*: entró después del inicio por otra razón.
- *Retirada o trasladada*: salió durante el sprint. No cuenta en el alcance ni como completada.
- *Ya completada al entrar*: no se cuenta en ese sprint (por ejemplo, la subtarea terminada en el Sprint 1 cuya historia se arrastró al Sprint 2).
- En sprints cerrados se usa el **estado al cierre**: lo terminado en el sprint siguiente no cuenta en el original.
- *Cumplimiento del compromiso* = completadas de (comprometidas + arrastradas) / (comprometidas + arrastradas).

**Personas.** Se usa el Assignee actual de cada UE: el de la subtarea, no el de su historia. Las UE sin responsable van a *Sin asignar*. El interruptor *Solo el equipo configurado* oculta a quienes no están en `people`.

**Sin datos, no hay número.** Lo que no puede calcularse se muestra como *No calculable* con el motivo; no se inventan fechas, duraciones ni asignaciones.

## Pruebas

```bash
npm test             # frontend: reglas de cálculo (UE, ponderación, sprints, personas)
                     # backend: normalización, cliente de Jira, sesiones, configuración
npm run typecheck
```

`backend/src/contract/snapshot.ts` y `frontend/src/domain/contract.ts` deben ser idénticos; un test del backend lo comprueba.

## Despliegue

Un solo servicio web. Dos opciones equivalentes:

- **Render** (o similar con Node): `render.yaml` crea el servicio. Compila con `npm run install:all && npm run build` y arranca con `npm start`. En el panel se cargan `JIRA_EMAIL`, `JIRA_API_TOKEN` y `DASHBOARD_PASSWORD`; `SESSION_SECRET` se genera solo.
- **Cualquier plataforma con contenedores**: `Dockerfile` en la raíz produce una imagen con API y dashboard (`docker build -t jira-dashboard .` y `docker run -p 3100:3100 --env-file backend/.env jira-dashboard`).

Comprobación de salud: `GET /api/health`.

Con `DASHBOARD_PASSWORD` definido, el dashboard pide una contraseña compartida y emite una sesión firmada (`SESSION_HOURS`, 12 h por defecto). Sin ella, queda abierto; úsalo así solo en local.
