# 🧱 Infraestructura — SRE Copilot

Terraform de la demo: Resource Group, App Service (API con errores a propósito),
Application Insights + Log Analytics, Function App del copilot, Key Vault,
Azure OpenAI, Azure AI Search y la Static Web App del dashboard.

Todo lo que hay aquí está descrito en el `README.md` de la raíz y en los
contratos (`CONTRACTS.md`). Este fichero explica **cómo se despliega, qué
secretos hace falta y cómo se destruye**.

---

## 📋 Requisitos previos

| Herramienta | Versión | Para qué |
|---|---|---|
| Terraform | >= 1.4 | `terraform_data` (bootstrap del índice de AI Search) |
| Azure CLI | >= 2.51 | `az search index create` (creación del índice de AI Search) |
| Credenciales | — | `az login` con una identidad con permisos sobre el Resource Group |

```bash
az login
az account set --subscription "<subscription-id>"
```

---

## 🚀 Puesta en marcha

```bash
cd infrastructure

# 1. Copia y ajusta las variables (terraform.tfvars NO se versiona)
cp terraform.tfvars.example terraform.tfvars

# 2. Los secretos van por entorno, nunca en un fichero
export TF_VAR_github_token="ghp_xxx"
export TF_VAR_dynatrace_api_token="dt0c01.xxx"

# 3. Ciclo de vida
terraform init        # descarga el provider azurerm (~> 3.75)
terraform fmt         # formatea los .tf
terraform validate    # comprueba la sintaxis -> "Success!"
terraform plan        # qué se va a crear
terraform apply       # crea todo (pide confirmación)
```

> ⚠️ **El estado de Terraform contiene secretos en claro** (las claves de Key
> Vault, los tokens...). Trátalo como un fichero de credenciales: no lo subas
> a ningún sitio y, para CI, usa un backend remoto (ver más abajo).

---

## 🔑 Secretos que exige esta infraestructura

| Variable de Terraform | Origen | Dónde acaba |
|---|---|---|
| `github_token` (**obligatoria**) | `TF_VAR_github_token` / `TF_VAR_github_token` en CI | Key Vault → secreto `github-token` → app setting `GITHUB_TOKEN` |
| `dynatrace_api_token` (**obligatoria**) | `TF_VAR_dynatrace_api_token` / `TF_VAR_dynatrace_api_token` en CI | Key Vault → secreto `dynatrace-api-token` → app setting `DYNAUTRACE_API_TOKEN` |
| `azurerm_cognitive_account.openai.primary_access_key` | Lo genera Azure | Key Vault → `azure-openai-api-key` → `AZURE_OPENAI_API_KEY` |
| `azurerm_search_service.memory.primary_key` | Lo genera Azure | Key Vault → `azure-search-api-key` → `AZURE_SEARCH_API_KEY` |
| `azurerm_application_insights.main.connection_string` | Lo genera Azure | Key Vault → `appinsights-connection-string` |

Las dos primeras son **variables sensibles sin valor por defecto**: `terraform
plan` fallará con "No value for required variable" si no están presentes. Es
intencionado: así no se despliega un copilot sin GitHub ni Dynatrace.

---

## 🧱 Recursos que crea este Terraform

| Recurso | Tipo | Nombre en el demo | Para qué |
|---|---|---|---|
| `azurerm_resource_group.main` | Resource Group | `rg-srecopilot-dev` | agrupa todo |
| `azurerm_log_analytics_workspace.main` | Log Analytics | `law-srecopilot-dev` | consultas KQL, retención y cuota diaria |
| `azurerm_application_insights.main` | App Insights | `appi-srecopilot-dev` | telemetría de la API y de la Function |
| `azurerm_service_plan.api` | App Service Plan (B1) | `asp-srecopilot-api-dev` | hosting de la API |
| `azurerm_linux_web_app.api` | App Service | `app-srecopilot-api-dev` | API de ejemplo **con fallos a propósito** |
| `azurerm_storage_account.functions` | Storage Account | `stsrecopilotdev` | almacenamiento de la Function App |
| `azurerm_service_plan.functions` | Consumption plan (Y1) | `asp-srecopilot-fn-dev` | hosting de la Function |
| `azurerm_linux_function_app.copilot` | Function App | `func-srecopilot-dev` | el motor de diagnóstico |
| `azurerm_key_vault.main` | Key Vault | `kv-srecopilot-dev` | secretos |
| `azurerm_key_vault_secret.*` | Key Vault Secret | `appinsights-connection-string`, `azure-openai-api-key`, `azure-search-api-key`, `github-token`, `dynatrace-api-token` | credenciales |
| `azurerm_cognitive_account.openai` | Azure OpenAI | `oai-srecopilot-dev` | cuenta del LLM |
| `azurerm_cognitive_deployment.chat` | Model deployment | `gpt-4o` | despliegue del modelo |
| `azurerm_search_service.memory` | Azure AI Search | `srch-srecopilot-dev` | memoria de incidentes |
| `terraform_data.search_index` | — | índice `incidents` | crea el índice desde `search-index.json` |
| `azurerm_static_web_app.frontend` | Static Web App | `swa-srecopilot-dev` | dashboard React |

### App settings de la Function App

| Setting | Valor |
|---|---|
| `LLM_PROVIDER` | `var.llm_provider` (`azure-openai` \| `anthropic` \| `mock`) |
| `AZURE_OPENAI_ENDPOINT` | `azurerm_cognitive_account.openai.endpoint` |
| `AZURE_OPENAI_DEPLOYMENT` | `azurerm_cognitive_deployment.chat.name` |
| `AZURE_OPENAI_API_KEY` | leído del Key Vault (`azure-openai-api-key`) |
| `GITHUB_TOKEN` | leído del Key Vault (`github-token`) |
| `GITHUB_REPO` | `var.github_repo` (`owner/repo`) |
| `DYNAUTRACE_API_URL` | `var.dynatrace_api_url` |
| `DYNAUTRACE_API_TOKEN` | leído del Key Vault (`dynatrace-api-token`) |
| `AZURE_SEARCH_ENDPOINT` | `https://<search>.search.windows.net` |
| `AZURE_SEARCH_INDEX` | `var.search_index_name` |
| `AZURE_SEARCH_API_KEY` | leído del Key Vault (`azure-search-api-key`) |
| `APPINSIGHTS_INSTRUMENTATIONKEY` / `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights |

> La `DATABASE_URL` mal configurada del **App Service de la API** es
> intencionada (es el incidente que diagnostica el copilot). No la "arregles".

---

## 🔢 La memoria de incidentes (Azure AI Search)

El índice se define en [`search-index.json`](./search-index.json) (versionado en
el repo, no en el portal). Los campos siguen el contrato `IncidentSummary`:
`id`, `service`, `generatedAt`, `summary`, `rootCause`, `confidence`,
`feedback`, `tags` y `content`.

El provider `azurerm` 3.x **no tiene** recurso para el índice, así que se crea
con `terraform_data` + `local-exec` usando la CLI de Azure:

```bash
az search index create \
  --service-name srch-srecopilot-dev \
  --name incidents \
  --admin-key "$(az search admin key show --service-name srch-srecopilot-dev --query primaryKey -o tsv)" \
  --parameters search-index.json
```

* Requiere Azure CLI >= 2.51 autenticado en el momento del `apply`.
* Si cambias `search_index_name`, cambia también el `"name"` de
  `search-index.json`.
* El copilot **funciona sin AI Search**: el contrato §5 define un fallback
  local con búsqueda por tokens y similitud coseno. El índice es la vía
  "buena" cuando está disponible.

---

## 📊 Observabilidad

* **Log Analytics**: retención `log_retention_in_days` (30 por defecto) y cuota
  diaria `log_daily_quota_gb` (1 GB) para que una ráfaga de errores no dispare
  la factura del demo.
* **Application Insights**: `sampling_percentage = 100` (sin muestreo). El
  copilot cuenta excepciones y trazas para correlacionar el incidente; si el
  sampling descartara telemetría, los conteos de las consultas KQL no
  cuadrarían con lo que pasó de verdad.

---

## 🔢 Orden de despliegue

Terraform resuelve las dependencias por referencias, pero este es el orden
lógico de creación (y el que usa el workflow `deploy.yml`):

1. **Resource Group** — el contenedor de todo.
2. **Log Analytics → Application Insights** — la telemetría tiene que existir
   antes que las apps que la emiten.
3. **Storage Account → Service Plan → Function App** — la Function necesita
   su almacenamiento y su plan.
4. **App Service Plan → App Service (API)**.
5. **Azure OpenAI (cuenta → deployment)** — el LLM.
6. **Azure AI Search → índice** — la memoria de incidentes.
7. **Key Vault → secretos → lectura de los secretos** — los secretos se
   escriben y después se leen para los app settings.
8. **Static Web App** — el dashboard.

El código (backend, copilot-function, frontend) se publica **después** del
apply, en el workflow `deploy.yml`:

```
terraform apply → build (backend, copilot-function) → publish backend
                 → publish copilot-function → publish frontend
                 → customEvent "Deploy" en Application Insights
```

El `customEvent` es el último a propósito: el copilot correlaciona los
incidentes con los deploys a través de ese evento.

---

## 🚀 CI/CD

Los workflows viven en [`../.github/workflows`](../.github/workflows):

| Workflow | Qué hace |
|---|---|
| `ci.yml` | lint + typecheck + tests de los 3 componentes y `terraform fmt/validate` |
| `deploy.yml` | apply de Terraform, publicación de los 3 componentes y `customEvent` |

Secretos que hay que configurar en GitHub (Settings → Secrets and variables →
Actions):

| Secreto | Para qué |
|---|---|
| `AZURE_CREDENTIALS` | service principal en JSON (lo usa `azure/login`) |
| `AZURE_PUBLISH_PROFILE_API` | publish profile del App Service de la API |
| `AZURE_PUBLISH_PROFILE_COPILOT` | publish profile de la Function App |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | token de deployment de la Static Web App |
| `APPINSIGHTS_CONNECTION_STRING` | connection string de App Insights (o `APPINSIGHTS_KEY` + `APPINSIGHTS_URL`) |
| `GITHUB_PAT` | token de GitHub del copilot (`TF_VAR_github_token`) |
| `DYNAUTRACE_API_TOKEN` | token de Dynatrace (`TF_VAR_dynatrace_api_token`) |
| `TF_BACKEND_CONFIG_B64` | (opcional) backend remoto de Terraform en base64 |

> ⚠️ **El estado local no sirve para CI.** Sin `TF_BACKEND_CONFIG_B64` cada
> `apply` partiría de cero y chocaría con "Resource already exists". Configura
> un backend remoto:
>
> ```hcl
> # providers.tf
> backend "azurerm" {}
> ```
>
> ```bash
> terraform init -backend-config=backend.hcl
> ```
>
> donde `backend.hcl` lleva `resource_group_name`, `storage_account_name`,
> `container_name` y `key`. Codifícalo en base64 y guárdalo como
> `TF_BACKEND_CONFIG_B64`.

---

## 💣 Cómo destruir todo

```bash
cd infrastructure
terraform destroy          # pide confirmación (escribe "yes")
```

O, sin preguntas:

```bash
terraform destroy -auto-approve
```

Antes de destruir, revisa estos detalles:

1. **Key Vault**: `purge_protection_enabled = false` y `soft_delete_retention_days = 7`,
   así que los secretos se purgan solos a la semana. Si lo cambias, hay que
   vaciar el vault a mano (`az keyvault purge`) antes de eliminarlo.
2. **Coste**: los recursos con coste (Log Analytics, Azure OpenAI, AI Search,
   Storage) siguen facturando mientras existan. Destruir el Resource Group
   entero (`az group delete --name rg-srecopilot-dev`) es más rápido, pero
   deja el estado de Terraform desincronizado: hazlo con `terraform destroy`.
3. **Deployment tokens**: la Static Web App y los publish profiles se
   invalidan al recrear los recursos; vuelve a exportarlos desde el portal.

```bash
# Comprobación de que no queda nada
terraform state list
az group exists --name rg-srecopilot-dev
```

---

## 📚 Referencias

- Contratos de la plataforma: [`../CONTRACTS.md`](../CONTRACTS.md)
- Guías del hackathon: [`../guia`](../guia)
- Provider usado: `hashicorp/azurerm ~> 3.75` (fijado en
  [`.terraform.lock.hcl`](./.terraform.lock.hcl))
