# SRE Copilot - Backend

> API de demostracion **con errores a proposito** 😉. Su trabajo no es ser production code:
> es **generar el incidente** que el `copilot-function` diagnostica después con KQL, trazas y commits.

- Node 22 + TypeScript estricto + Express.
- OpenTelemetry con auto-instrumentacion de `http`/`express`.
- Exportador de **Application Insights** si hay `APPLICATIONINSIGHTS_CONNECTION_STRING`; si no, exportador
  de **consola**.
- Fallos **deterministas**: el mismo `FAILURE_MODE` produce siempre el mismo error, el mismo tipo de
  excepcion y el mismo `operation_Name`.

---

## 1. Puesta en marcha

```bash
npm install
npm run dev            # http://localhost:8080
```

Scripts disponibles:

| Script | Que hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga (`tsx watch`). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Ejecuta el compilado (`node dist/index.js`). |
| `npm test` | Tests con vitest (sin red, sin credenciales). |
| `npm run typecheck` | `tsc --noEmit` en modo estricto. |
| `npm run lint` | ESLint (flat config). |

Variables de entorno: copia `.env.example` a `.env` (Node 22 lo carga con `--env-file`; `npm run dev`
y `npm start` ya lo hacen con `--env-file-if-exists`). **Nunca subas el `.env`**: los secretos van por
variable de entorno o Key Vault.

---

## 2. Rutas (CONTRACTS.md §7)

| Método | Ruta | `operation_Name` | Que hace |
|---|---|---|---|
| `GET` | `/health` | `Health` | Health del backend. Nunca falla. |
| `GET` | `/api/catalog` | `Catalog` | Productos y stock. Ruta de apoyo: nunca falla. |
| `GET` | `/api/checkout` | `Checkout` | Crea una orden. **Falla con el modo de fallo activo.** |
| `GET` | `/api/payment` | `Payment` | Autoriza un cobro. **Falla con el modo de fallo activo.** |
| `GET` | `/api/inventory` | `Inventory` | Consulta stock. **Falla con el modo de fallo activo.** |
| `GET` | `/api/chaos` | `Chaos` | Activa/desactiva un fallo en caliente. |

El `operation_Name` se publica por **triple** (que es lo que pide el contrato):

1. Cabecera de respuesta `x-operation-name: Checkout`.
2. Campo `operationName` del log estructurado.
3. Atributo `operation_Name` del span de OpenTelemetry (ademas el span raiz se renombra con ese
   valor, de modo que `requests.operation_Name` en Application Insights vale `Checkout`).

Respuesta OK (ejemplo):

```json
{
  "orderId": "order_0001",
  "items": [{ "sku": "SKU-1001", "name": "Aurora Mechanical Keyboard", "quantity": 1, "unitPrice": 129 }],
  "total": 188.5,
  "currency": "EUR",
  "status": "confirmed",
  "correlationId": "0f1d0f9c-6d2f-4a3f-9d3a-4a1f2b3c4d5e",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

Respuesta de error (formato unico para toda la API):

```json
{
  "error": {
    "code": "DATABASE_TIMEOUT",
    "message": "Database connection timed out after 5000ms",
    "operationName": "Checkout",
    "correlationId": "0f1d0f9c-6d2f-4a3f-9d3a-4a1f2b3c4d5e"
  }
}
```

Cabeceras que devuelve toda peticion: `x-operation-name`, `x-correlation-id`, `x-failure-mode` y
`x-trace-id`.

---

## 3. Modos de fallo

El modo se fija con `FAILURE_MODE` (por defecto `none`) y se puede cambiar en caliente:

```bash
curl "http://localhost:8080/api/chaos?mode=database"   # activa el fallo
curl "http://localhost:8080/api/chaos?mode=reset"      # vuelve al valor de FAILURE_MODE
curl "http://localhost:8080/api/chaos"                  # consulta el modo activo
```

| Modo | HTTP | `error.code` | Tipo de excepcion (`exceptions.type`) | Mensaje | Que se rompe |
|---|---|---|---|---|---|
| `none` | 200 | - | - | - | Nada. |
| `database` | **504** | `DATABASE_TIMEOUT` | `DatabaseTimeoutError` | `Database connection timed out after 5000ms` | Timeout de la base de datos: el `DATABASE_URL` apunta a `wrong-host` (ver §4). |
| `misconfig` | **500** | `CONFIGURATION_ERROR` | `ConfigurationError` | `Invalid application configuration: required setting 'PAYMENT_PROVIDER_KEY' is missing` | Falta un app setting obligatorio. |
| `dependency` | **502** | `UPSTREAM_DEPENDENCY_ERROR` | `UpstreamDependencyError` | `Upstream dependency 'payments-api' returned 502 Bad Gateway` | El proveedor de pagos upstream devuelve 5xx. |

Notas de determinismo:

- El **mensaje** y el **codigo** son constantes: la KQL `summarize by type, outerMessage` agrupa
  siempre igual entre ejecuciones de la demo.
- El `operation_Name` depende de la ruta (Checkout/Payment/Inventory), nunca del azar.
- Solo el `correlationId` (UUID) y los ids correlativos (`order_0001`, `payment_0001`) cambian entre
  peticiones.
- En los modos `database` y `dependency` se registra ademas un **span CLIENT** de la dependencia que
  falla (`server.address = wrong-host`, `peer.service = payments-api`), para que la tabla
  `dependencies` de Application Insights muestre *que* se rompio, no solo *que* se rompio.

---

## 4. El `DATABASE_URL` mal configurado (es parte de la demo)

`infrastructure/main.tf` despliega el backend con:

```hcl
"DATABASE_URL" = "postgres://wrong-host:5432/mydb"
```

**No se arregla**: es el escenario de la demo. El host no existe, asi que el modo `database` produce
un timeout, la dependencia `postgres` aparece en la traza apuntando a `wrong-host`, y el copilot puede
deducir que la causa raiz es la cadena de conexion del App Service. El valor por defecto del backend
local es exactamente el mismo, para que la demo se reproducible sin `.env`.

---

## 5. Observabilidad

### 5.1 OpenTelemetry

- `src/observability/telemetry.ts` registra el provider, el context manager
  (`AsyncLocalStorageContextManager`), los propagadores W3C (`traceparent` + baggage) y la
  auto-instrumentacion de `http` y `express`.
- Exportador: **Azure Monitor** (`@azure/monitor-opentelemetry-exporter`) si hay
  `APPLICATIONINSIGHTS_CONNECTION_STRING`; **consola** en caso contrario.
- El modulo de Express se carga con `import()` dinamico *despues* de registrar la instrumentacion:
  los auto-instrumentadores parchean el modulo en el momento de importarlo, asi que el orden importa.

### 5.2 Correlacion

- `x-correlation-id`: si el cliente lo envia, se reutiliza; si no, se genera un UUID.
- Viaja en la cabecera, en el cuerpo (campo `correlationId`) y en el log.
- El `traceparent` entrante se propaga: el trace del backend cuelga del trace del cliente, de modo
  que el copilot puede correlacionar la peticion con las consultas KQL por `operation_Id`/`traceId`.

### 5.3 Log estructurado

Una linea JSON por peticion:

```json
{
  "timestamp": "2026-10-20T22:45:00.000Z",
  "level": "error",
  "message": "request_failed",
  "service": "sre-copilot-backend",
  "operationName": "Checkout",
  "correlationId": "0f1d0f9c-6d2f-4a3f-9d3a-4a1f2b3c4d5e",
  "durationMs": 3,
  "status": 504,
  "errorCode": "DATABASE_TIMEOUT",
  "errorType": "DatabaseTimeoutError",
  "errorMessage": "Database connection timed out after 5000ms",
  "failureMode": "database",
  "method": "GET",
  "path": "/api/checkout"
}
```

El modo de fallo activo se registra en **cada** peticion (campo `failureMode`), como exige el
contrato.

`message` es el **nombre del evento** (`request_completed`, `request_failed`, ...) y es una clave
reservada: el texto del error va en `errorMessage`, de modo que ningun campo extra pueda pisar el
nombre del evento (que es lo que agrupa el copilot).

---

## 6. De los modos de fallo a las KQL del copilot

Estas son las consultas que el `copilot-function` deberia ejecutar (contrato §3) y que este backend
alimenta.

### 6.1 Que se esta rompiendo y donde

```kusto
exceptions
| where timestamp > ago(15m)
| summarize count() by type, outerMessage, operation_Name
| order by count_ desc
```

| Modo | `type` | `outerMessage` | `operation_Name` |
|---|---|---|---|
| `database` | `DatabaseTimeoutError` | `Database connection timed out after 5000ms` | `Checkout` / `Payment` / `Inventory` |
| `misconfig` | `ConfigurationError` | `Invalid application configuration: required setting 'PAYMENT_PROVIDER_KEY' is missing` | `Checkout` / `Payment` / `Inventory` |
| `dependency` | `UpstreamDependencyError` | `Upstream dependency 'payments-api' returned 502 Bad Gateway` | `Checkout` / `Payment` / `Inventory` |

### 6.2 Latencia y dependencias con error

```kusto
dependencies
| where timestamp > ago(15m)
| where success == false
| summarize count() by target, type, resultCode
```

- Modo `database` -> dependencia `postgres` hacia `wrong-host:5432` (`db.system = postgresql`,
  `db.name = mydb`).
- Modo `dependency` -> dependencia `payments-api` con `resultCode = 502`.

### 6.3 Peticiones fallidas por operacion

```kusto
requests
| where timestamp > ago(15m)
| where success == false
| summarize count(), p95_duration = percentile(duration, 95) by operation_Name, resultCode
```

| Modo | `operation_Name` | `resultCode` |
|---|---|---|
| `database` | `Checkout` / `Payment` / `Inventory` | 504 |
| `misconfig` | `Checkout` / `Payment` / `Inventory` | 500 |
| `dependency` | `Checkout` / `Payment` / `Inventory` | 502 |

### 6.4 Correlacion con el deploy

```kusto
customEvents
| where name == "Deploy"
| top 1 by timestamp desc
| project commit_sha = tostring(customDimensions.commitSha), deployedAt = timestamp
```

El backend no emite este evento (lo emite el pipeline de GitHub Actions), pero las dos piezas -
`operation_Name` y excepcion con mensaje estable - son las que permiten al copilot cerrar el
"empiezo tras el deploy" -> "causa raiz: cadena de conexion mal configurada".

---

## 7. Estructura del componente

```
backend/
├── src/
│   ├── index.ts                  # arranque: config -> telemetria -> import dinamico de la app -> listen
│   ├── app.ts                    # composicion de la app Express y de las rutas
│   ├── config.ts                 # lectura y validacion del entorno
│   ├── domain/
│   │   ├── catalog.ts            # datos fijos de la demo
│   │   ├── database.ts           # parseo del DATABASE_URL (host, puerto, base de datos)
│   │   ├── errors.ts             # ApiError y formato { error: { ... } }
│   │   ├── failure-injection.ts  # inyeccion del fallo + span de la dependencia que falla
│   │   ├── failure-modes.ts      # catalogo de modos (codigo, status, mensaje, tipo de excepcion)
│   │   └── operations.ts         # operation_Name por ruta
│   ├── middleware/
│   │   ├── error-handler.ts      # formato de error unico + 404
│   │   └── request-context.ts    # correlation id, operation name, cabeceras, span raiz
│   ├── observability/
│   │   ├── logger.ts             # log estructurado JSON
│   │   ├── request-context.ts    # contexto de la peticion (WeakMap)
│   │   ├── spans.ts              # nombre/atributos del span y span de dependencia
│   │   └── telemetry.ts          # OpenTelemetry: provider, exportadores, instrumentacion
│   ├── routes/
│   │   ├── catalog.ts, checkout.ts, payment.ts, inventory.ts, health.ts, chaos.ts
│   │   ├── define-route.ts       # helper que registra la ruta y su operation_Name
│   │   └── deps.ts
│   └── state/failure-mode-store.ts  # modo de fallo (env + override en caliente)
└── tests/                        # vitest + supertest, sin red y sin credenciales
```

---

## 8. Decisiones de diseño (y por que)

- **El modo de fallo solo afecta a las tres operaciones de negocio** (`Checkout`, `Payment`,
  `Inventory`). `/health`, `/api/catalog` y `/api/chaos` responden siempre bien: el health check de
  App Service y la demo necesitan un catalogo que se pueda mostrar aunque el backend este "roto".
- **El mensaje de error es una constante**, no se interpola el host ni el timestamp: asi el
  `summarize by type, outerMessage` de la KQL agrupa igual en todas las ejecuciones. El detalle
  variable (host equivocado, puerto) va en el span de dependencia y en el log.
- **Codigos HTTP diferenciados** (504 / 500 / 502) porque cada modo representa una causa raiz
  distinta: timeout de base de datos, error de configuracion y dependencia upstream caida.
- **El error se registra en el span raiz** (no en un span de capa), para que la tabla `exceptions`
  quede asociada a la operacion (`operation_Name = "Checkout"`).
