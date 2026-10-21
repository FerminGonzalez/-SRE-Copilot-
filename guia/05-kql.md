# 05 — KQL (Kusto Query Language)
## Observabilidad en Application Insights / Log Analytics

---

## 🧱 1. Anatomía de toda consulta KQL

```
[tabla]
| operador1
| operador2
| operador3
```

- Empieza SIEMPRE con una **tabla** (no hay `SELECT * FROM`)
- Los operadores van separados por pipe `|` y se leen de arriba hacia abajo
- **Case sensitive en nombres de columnas:** `resultCode` ✔️ · `result_code` ✖️

### Tablas principales de Application Insights

| Tabla | Contiene | Columnas clave |
|---|---|---|
| `requests` | Peticiones HTTP entrantes | `name`, `resultCode`, `duration`, `url`, `success` |
| `exceptions` | Excepciones lanzadas | `type`, `outerMessage`, `innermostMessage`, `operation_Name` |
| `traces` | Logs/telemetría personalizada | `message`, `severityLevel`, `customDimensions` |
| `dependencies` | Llamadas salientes (DB, APIs) | `target`, `name`, `success`, `resultCode` |
| `customEvents` | Eventos personalizados (¡nuestros Deploys!) | `name`, `customDimensions` |
| `pageViews` | Vistas de página | `name`, `duration` |
| `availabilityResults` | Health checks | `name`, `success`, `location` |

---

## 🔍 2. Filtrado y proyección

```kusto
// Filtrar: where
exceptions | where timestamp > ago(1h)
requests | where resultCode == 500
traces | where message contains "error"
requests | where name startswith "GET /api/orders"

// Proyectar: project (elegir columnas) y extend (crear columnas)
requests
| project timestamp, name, resultCode, duration
| extend duracionSeg = duration / 1000

// Ordenar y limitar
requests | order by timestamp desc | take 10
exceptions | top 5 by timestamp desc      // equivalente
```

---

## 📊 3. Agregaciones (las que más caen en exámenes)

```kusto
// summarize = GROUP BY de SQL
exceptions | summarize count() by type
requests   | summarize total = count(), avg(duracion) = avg(duration) by name

// order by count_ desc → los valores más frecuentes primero
exceptions
| where timestamp > ago(1h)
| summarize count() by type, outerMessage
| order by count_ desc

// bin = agrupar por intervalos de tiempo (¡para alertas!)
requests
| where timestamp > ago(2h)
| summarize errores = count() by bin(timestamp, 5m), resultCode
| where resultCode == 500

// distinct / dcount (contar valores únicos)
traces | distinct message
requests | summarize usuarios = dcount(user_Id)
```

### Operadores de tiempo imprescindibles

```kusto
ago(30m)      // hace 30 minutos
ago(2h)       // hace 2 horas
ago(1d)       // hace 1 día
startofday(ago(1d))   // inicio del día de ayer
now()         // este momento
datetime("2026-10-07T19:00:00Z")  // fecha exacta
```

---

## 🔗 4. Consultas de correlación (nivel avanzado — nivel ⭐⭐⭐)

```kusto
// Correlacionar excepciones con la petición que las causó (operation_Id)
let opsConError = requests | where resultCode == 500 | project operation_Id;
exceptions
| where operation_Id in (opsConError)
| project timestamp, type, outerMessage, operation_Id

// ¿Coincide el error con un deploy reciente? (¡LA consulta del SRE Copilot!)
let ultimoDeploy = customEvents
    | where name == "Deploy"
    | top 1 by timestamp desc
    | project deployTime = timestamp, commitSha = tostring(customDimensions.commitSha);
exceptions
| where timestamp > ago(1h)
| extend minutosDesdeDeploy = datetime_diff("minute", timestamp, toscalar(ultimoDeploy | project deployTime))
| summarize errores = count() by type, minutosDesdeDeploy
| order by minutosDesdeDeploy asc

// Trazas distribuidas: seguir una petición entre servicios
traces
| where operation_Id == "ID-DE-LA-PETICION"
| order by timestamp asc
| project timestamp, message, severityLevel
```

---

## 🚨 5. Consultas de troubleshooting listas para copiar

```kusto
// 1. ¿Qué endpoints fallan MÁS ahora mismo?
requests
| where timestamp > ago(15m) and success == false
| summarize fallos = count() by name, resultCode
| order by fallos desc

// 2. ¿Cuál es el mensaje de error dominante?
exceptions
| where timestamp > ago(30m)
| summarize count() by type, outerMessage
| order by count_ desc

// 3. ¿Hay un patrón temporal? (empieza a las X hora)
exceptions
| where timestamp > ago(6h)
| summarize count() by bin(timestamp, 30m)
| render timechart      // ¡renderiza un gráfico!

// 4. ¿Una dependencia externa es la culpable?
dependencies
| where timestamp > ago(1h) and success == false
| summarize fallos = count() by target, type
| order by fallos desc

// 5. Latencia percentil 95 por endpoint (detecta lentitud antes de que caiga)
requests
| where timestamp > ago(1h)
| summarize p95 = percentile(duration, 95), p50 = percentile(duration, 50) by name
| order by p95 desc

// 6. Health check: ¿mi app está arriba?
availabilityResults
| where timestamp > ago(30m)
| summarize disponibilidad = avg(todouble(success)) by name
| where disponibilidad < 1.0

// 7. CORS u otros errores del navegador → los veo en pageViews + traces
traces
| where timestamp > ago(30m)
| where message contains "CORS" or message contains "blocked"
| project timestamp, message
```

---

## 🧪 6. Practicar KQL SIN tener Azure

```
1. Abrir: https://aka.ms/kql  (demo público gratuito de Microsoft)
2. La tabla demo es StormEvents — misma sintaxis, datos reales de clima
3. Ejercicios:
   - StormEvents | where State == "TEXAS" | count
   - StormEvents | summarize count() by EventType | order by count_ desc
   - StormEvents | where StartTime > ago(30d)   // no funciona: es histórica, usa fechas literales
```

---

## 📋 Chuleta de un vistazo

```
where        filtrar filas
project      elegir columnas
extend       crear columna calculada
summarize    agrupar y agregar (count, avg, sum, dcount, percentile, countif)
by           cláusula de agrupación de summarize
bin()        bucket temporal (alertas: bin(timestamp, 5m))
order by     ordenar (desc/asc)
take / top   limitar resultados
join         unir tablas
render       timechart / barchart / piechart
let          variable reutilizable
toscalar()   convertir tabla de 1 valor a escalar
ago(30m)     filtro de tiempo relativo
datetime_diff("minute", a, b)   diferencia en minutos
contains / startswith / endswith   filtros de texto
in ()        pertenencia a lista
```
