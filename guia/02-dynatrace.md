# 02 — Comandos Dynatrace
## Playground, OneAgent, APIs REST y Davis AI

---

## 🚀 1. Setup inicial (Dynatrace Playground)

```bash
# Paso 1: Registrarse (manual en navegador)
# → https://playground.dynatrace.com (o el link de tu guía de la Sesión 6)

# Paso 2: Obtener la URL del entorno (lo verás en el banner superior)
# Formato: https://<id>.playground.dynatrace.com
export DT_URL="https://TU-ID.playground.dynatrace.com"

# Paso 3: Crear token de API (manual: Settings → Access tokens → Generate new token)
# Permisos mínimos necesarios:
#   - problems.read        (leer problemas detectados por Davis AI)
#   - metrics.read         (consultar métricas)
#   - entities.read        (leer entidades del Smartscape)
#   - openPipeline.events.read
export DT_TOKEN="dt0c01.XXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Paso 4: Verificar conexión — el "hola mundo" de Dynatrace
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/problems?fields=problemId" | head -20
```

---

## 🤖 2. OneAgent: instrumentar tu app (SIN cambiar código)

### Opción A: App Service de Azure (nuestro caso en SRE Copilot)

```bash
# Instalar OneAgent como extensión del sitio Azure (un solo comando)
az webapp site-extension set --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev \
  --extension-name Dynatrace.AppServices.Extension

# Agregar variables que el OneAgent necesita
az webapp config appsettings set --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev \
  --settings \
    DT_TENANT="<TU-ID>.playground.dynatrace.com" \
    DT_API_TOKEN="$DT_TOKEN" \
    DT_CONNECTION_POINT="$DT_URL/api" \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=true

az webapp restart --name app-srecopilot-api-dev --resource-group rg-srecopilot-dev
```

### Opción B: App Node.js local (para practicar en tu máquina)

```bash
# Descargar OneAgent (Linux)
wget -O Dynatrace-OneAgent.sh \
  "$DT_URL/api/v1/deployment/installer/agent/unix/default/latest?arch=x86&flavor=default" \
  --header="Authorization: Api-Token $DT_TOKEN"

# Instalar y reiniciar tu app con el agente
sudo sh Dynatrace-OneAgent.sh --set-host-name=mi-laptop-hackathon
```

### Verificar que OneAgent reporta

```bash
# Debe aparecer tu host/app en la lista de entidades
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/entities?pageSize=5" | python3 -m json.tool
```

---

## 🔍 3. API Problems (el corazón de Davis AI)

```bash
# Problemas ACTUALMENTE abiertos
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/problems?status=OPEN" | python3 -m json.tool

# Problemas de las últimas 2 horas (formato Unix timestamp en ms)
FROM=$(date -d '2 hours ago' +%s000)   # Linux/Mac
# FROM=$(powershell -c "(Get-Date).AddHours(-2).ToUniversalTime().Subtract([datetime]'1970-01-01').TotalMilliseconds")  # Windows
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/problems?from=$FROM&fields=problems(problemId,title,severityLevel,rootCauseEntity)" | python3 -m json.tool

# Detalle de UN problema específico (causa raíz, evidencia, impacto)
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/problems/<problem-id>" | python3 -m json.tool

# Contar problemas abiertos (útil para alertas automatizadas)
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/problems?status=OPEN&fields=problems(problemId)" \
  | grep -c problemId
```

---

## 📈 4. API Metrics (error rate, latencia, requests)

```bash
# Error rate de un servicio (las 2 últimas horas)
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/metrics/query?metricSelector=builtin:service.errors.total.rate:avg&from=now-2h&resolution=5m" | python3 -m json.tool

# Latencia percentil 95 de todos los servicios
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/metrics/query?metricSelector=builtin:service.response.time:percentile(95)&from=now-1h" | python3 -m json.tool

# Requests por minuto
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/metrics/query?metricSelector=builtin:service.requestCount.total:rate(1m)&from=now-30m" | python3 -m json.tool

# Listar métricas disponibles que contienen "error" (¡descubre qué existe!)
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/metrics?fields=displayName&metricSelector=builtin:service.errors*" | python3 -m json.tool
```

---

## 🗺️ 5. Smartscape (mapa de dependencias)

```bash
# Listar servicios (entidades tipo SERVICE)
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/entities?entitySelector=type(SERVICE)&fields=displayName,tags" | python3 -m json.tool

# Ver host con sus procesos
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/entities?entitySelector=type(HOST)&fields=displayName,properties.memoryTotal" | python3 -m json.tool

# Dependencias de UN servicio específico
curl -s -H "Authorization: Api-Token $DT_TOKEN" \
  "$DT_URL/api/v2/entities/<entity-id>?fields=fromRelationships,toRelationships" | python3 -m json.tool
```

---

## 🧠 6. Davis AI — cómo "preguntarle" al CTF

Estos son los conceptos (no comandos) que debes dominar, porque son la respuesta a media docena de preguntas típicas:

| Pregunta del CTF | Respuesta | ¿Dónde se ve en el Playground? |
|---|---|---|
| ¿Qué detecta anomalías automáticamente? | **Davis AI** (causal AI determinística) | Problems feed |
| ¿Qué vista muestra el mapa de dependencias? | **Smartscape** | left menu → Smartscape |
| ¿Qué es un trace extremo a extremo? | **PurePath** (cada petición con contexto de código) | Distributed tracing |
| ¿Cómo se agrupan alertas relacionadas? | **Problem evolution** (correlación automática) | Dentro de un Problem |
| ¿Qué agente instala y qué captura? | **OneAgent** (logs+metrics+traces, auto-instrumentación) | Deployment status |

---

## 🌉 7. Puente Dynatrace ↔ Azure (para nuestro SRE Copilot)

```bash
# La Function del Copilot consulta Dynatrace así (Node.js):
# ---------------------------------------------------------------
# const response = await fetch(
#   `${process.env.DT_URL}/api/v2/problems?status=OPEN`,
#   { headers: { "Authorization": `Api-Token ${process.env.DT_TOKEN}` } }
# );
# ---------------------------------------------------------------
# Los valores DT_URL y DT_TOKEN se guardan en Key Vault:
az keyvault secret set --vault-name kv-srecopilot-dev --name "dynatrace-url" --value "$DT_URL"
az keyvault secret set --vault-name kv-srecopilot-dev --name "dynatrace-token" --value "$DT_TOKEN"

# Leerlos desde la Function:
az keyvault secret show --vault-name kv-srecopilot-dev --name "dynatrace-url" --query value -o tsv
```

---

## 🚨 8. Troubleshooting rápido de Dynatrace

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| No veo mi host en el Smartscape | OneAgent no instalado o app no reiniciada | Reinstalar extensión + `az webapp restart` |
| Token da 401/403 | Permisos insuficientes o token expirado | Regenerar token con scopes: problems.read, metrics.read |
| No hay datos de trazas | La app no recibe tráfico | Generar carga: `curl <url>/api/orders` varias veces |
| El Playground no responde | Límite de sesión alcanzado | Re-registrarse / nueva sesión del Playground |
