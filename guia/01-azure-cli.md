# 01 — Comandos Microsoft Azure CLI
## Desde cero hasta producción

---

## 🔐 1. Autenticación y cuenta

```bash
# Login interactivo (abre el navegador)
az login

# Ver suscripción activa y su ID
az account show

# Listar todas las suscripciones
az account list --output table

# Cambiar de suscripción
az account set --subscription <id-de-suscripcion>

# Verificar identidad actual
az ad signed-in-user show
```

---

## 📦 2. Resource Groups

```bash
# Crear
az group create --name rg-srecopilot-dev --location eastus

# Listar
az group list --output table

# Ver detalle
az group show --name rg-srecopilot-dev

# Eliminar (¡todo lo que contiene se borra!)
az group delete --name rg-srecopilot-dev --yes --no-wait
```

---

## 🌐 3. App Service (la app del hackathon)

```bash
# Crear plan (F1 = GRATIS)
az appservice plan create --name asp-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev --sku F1 --is-linux

# Crear la web app (Node 20)
az webapp create --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev \
  --plan asp-srecopilot-api-dev --runtime "NODE:20-lts"

# Ver la URL
az webapp show --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev \
  --query defaultHostName -o tsv

# Configurar variables de entorno
az webapp config appsettings set --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev \
  --settings DATABASE_URL="postgres://host:5432/mydb"

# Listar variables actuales (¡verifica configs sin entrar al portal!)
az webapp config appsettings list --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev --output table

# Reiniciar
az webapp restart --name app-srecopilot-api-dev --resource-group rg-srecopilot-dev

# Ver estado y health
az webapp show --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev --query state
```

### 🩺 Logs y diagnóstico (SECCIÓN CRÍTICA para el CTF)

```bash
# Habilitar logs
az webapp log config --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev --application-logging filesystem --level information

# Ver logs EN VIVO — el comando más valioso de toda la guía
az webapp log tail --name app-srecopilot-api-dev --resource-group rg-srecopilot-dev

# Descargar logs como ZIP
az webapp log download --name app-srecopilot-api-dev \
  --resource-group rg-srecopilot-dev --log-file logs.zip
```

---

## 📊 4. Application Insights + KQL desde CLI

```bash
# Crear workspace de Log Analytics (requerido)
az monitor log-analytics workspace create \
  --workspace-name law-srecopilot-dev \
  --resource-group rg-srecopilot-dev

# Crear Application Insights
az monitor app-insights component create --app appi-srecopilot-dev \
  --resource-group rg-srecopilot-dev --location eastus \
  --workspace "/subscriptions/<sub-id>/resourceGroups/rg-srecopilot-dev/providers/Microsoft.OperationalInsights/workspaces/law-srecopilot-dev"

# Obtener connection string (para app settings)
az monitor app-insights component show --app appi-srecopilot-dev \
  --resource-group rg-srecopilot-dev --query connectionString -o tsv

# EJECUTAR KQL DESDE LA TERMINAL ⭐
az monitor app-insights query --app appi-srecopilot-dev \
  --analytics-query "exceptions | where timestamp > ago(1h) | count"

az monitor app-insights query --app appi-srecopilot-dev \
  --analytics-query "requests | summarize count() by resultCode"

# Enviar evento personalizado (¡así registramos deploys!)
az monitor app-insights events create --app appi-srecopilot-dev \
  --resource-group rg-srecopilot-dev \
  --type customEvents --name "Deploy" \
  --properties '{"commitSha":"a3f21bc","version":"1.0.2"}'
```

---

## ⚡ 5. Azure Functions

```bash
# Crear storage account (requerido por Functions)
az storage account create --name stsrecopilotdev \
  --resource-group rg-srecopilot-dev --sku Standard_LRS

# Crear plan Consumption (gratuito)
az functionapp plan create --name asp-srecopilot-fn-dev \
  --resource-group rg-srecopilot-dev --sku Y1 --is-linux

# Crear Function App
az functionapp create --name func-srecopilot-dev \
  --resource-group rg-srecopilot-dev \
  --storage-account stsrecopilotdev \
  --plan asp-srecopilot-fn-dev --runtime node --functions-version 4

# Ver URL del webhook de una función
az functionapp function show --name func-srecopilot-dev \
  --resource-group rg-srecopilot-dev --function-name <nombre-funcion>
```

---

## 🗝️ 6. Key Vault

```bash
# Crear
az keyvault create --name kv-srecopilot-dev \
  --resource-group rg-srecopilot-dev --location eastus

# Guardar un secreto
az keyvault secret set --vault-name kv-srecopilot-dev \
  --name "github-token" --value "<token-aqui>"

# Leer un secreto
az keyvault secret show --vault-name kv-srecopilot-dev \
  --name "github-token" --query value -o tsv

# Listar secretos (solo nombres, no valores)
az keyvault secret list --vault-name kv-srecopilot-dev --output table
```

---

## 🚨 7. Comandos de rescate (cuando algo falla)

```bash
# ¿Mi app está corriendo?
az webapp show --name <app> --resource-group <rg> --query state

# ¿Qué recursos tengo? (no te acuerdas del nombre exacto)
az resource list --resource-group rg-srecopilot-dev --output table

# Verificador de problemas de una app
az webapp config appsettings list --name <app> --resource-group <rg>

# Últimos eventos del resource group
az monitor activity-log list --resource-group rg-srecopilot-dev \
  --max-events 20 --output table

# Borrar TODO y empezar de nuevo (reset limpio)
terraform destroy && terraform apply -auto-approve
```

---

## 📋 Tabla rápida: ¿qué comando uso para...?

| Necesito... | Comando |
|---|---|
| Ver por qué mi app da 500 | `az webapp log tail` |
| Verificar una variable de entorno | `az webapp config appsettings list` |
| Correr una consulta KQL | `az monitor app-insights query` |
| Encontrar la URL de mi app | `az webapp show --query defaultHostName` |
| Resetear todo | `terraform destroy` |
| Ver recursos de mi grupo | `az resource list --output table` |
