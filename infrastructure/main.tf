# ============================================
# SRE Copilot - Infrastructure
# Resource Group + App Service + App Insights
# + Function App + Key Vault
# + Azure OpenAI + Azure AI Search
# + Static Web App (dashboard)
# ============================================

# ---------- Resource Group ----------
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project}-${var.environment}"
  location = var.location

  tags = {
    project     = "SRE Copilot"
    environment = var.environment
    managed_by  = "Terraform"
  }
}

# ---------- Application Insights + Log Analytics ----------
# App Insights moderno requiere un workspace de Log Analytics
resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${var.project}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_in_days

  # Cuota diaria de ingesta: en el demo evita que una ráfaga de errores
  # dispare la factura del workspace (y el coste de la demo).
  daily_quota_gb = var.log_daily_quota_gb

  # La Function consulta el workspace por KQL desde internet, así que la
  # ingesta y la consulta públicas deben seguir habilitadas.
  internet_ingestion_enabled = true
  internet_query_enabled     = true

  tags = {
    project = "SRE Copilot"
  }
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.project}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  # Sampling al 100% (sin muestreo): el copilot cuenta excepciones, trazas y
  # métricas para correlacionar el incidente. Si el sampling descartara
  # telemetría, los conteos de las consultas KQL no cuadrarían con lo que
  # realmente pasó en producción.
  sampling_percentage = var.app_insights_sampling_percentage

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- App Service Plan (FREE tier F1) ----------
resource "azurerm_service_plan" "api" {
  name                = "asp-${var.project}-api-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = "B1"

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- App Service: API de ejemplo (con errores a propósito 😉) ----------
resource "azurerm_linux_web_app" "api" {
  name                = "app-${var.project}-api-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.api.id

  site_config {
    always_on = false # No disponible en F1

    application_stack {
      node_version = "20-lts"
    }
  }

  app_settings = {
    "APPINSIGHTS_INSTRUMENTATIONKEY"             = azurerm_application_insights.main.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING"      = azurerm_application_insights.main.connection_string
    "ApplicationInsightsAgent_EXTENSION_VERSION" = "~3"
    "XDT_MicrosoftApplicationInsights_Mode"      = "default"
    # Variable de entorno mal configurada A PROPÓSITO para el demo (Paso 3 lo explica)
    "DATABASE_URL" = "postgres://wrong-host:5432/mydb"
  }

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- Storage Account (requerido por Function App) ----------
resource "azurerm_storage_account" "functions" {
  name                     = "st${var.project}${var.environment}"
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- Service Plan para Function (Consumption = Y1) ----------
resource "azurerm_service_plan" "functions" {
  name                = "asp-${var.project}-fn-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption - pago por ejecución, generoso free grant

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- Function App: el SRE Copilot ----------
resource "azurerm_linux_function_app" "copilot" {
  name                = "func-${var.project}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.functions.id

  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key

  site_config {
    minimum_tls_version = "1.2"

    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    "APPINSIGHTS_INSTRUMENTATIONKEY"        = azurerm_application_insights.main.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.main.connection_string

    # --- LLM (Azure OpenAI) ---
    "LLM_PROVIDER"            = var.llm_provider
    "AZURE_OPENAI_ENDPOINT"   = azurerm_cognitive_account.openai.endpoint
    "AZURE_OPENAI_DEPLOYMENT" = azurerm_cognitive_deployment.chat.name
    "AZURE_OPENAI_API_KEY"    = data.azurerm_key_vault_secret.azure_openai_api_key.value

    # --- GitHub (commits, diffs, ventanas de deploy) ---
    "GITHUB_TOKEN" = data.azurerm_key_vault_secret.github_token.value
    "GITHUB_REPO"  = var.github_repo

    # --- Dynatrace (problemas abiertos del servicio) ---
    "DYNAUTRACE_API_URL"   = var.dynatrace_api_url
    "DYNAUTRACE_API_TOKEN" = data.azurerm_key_vault_secret.dynatrace_api_token.value

    # --- Memoria de incidentes (Azure AI Search) ---
    "AZURE_SEARCH_ENDPOINT" = "https://${azurerm_search_service.memory.name}.search.windows.net"
    "AZURE_SEARCH_INDEX"    = var.search_index_name
    "AZURE_SEARCH_API_KEY"  = data.azurerm_key_vault_secret.azure_search_api_key.value
  }

  tags = {
    project = "SRE Copilot"
  }
}

# ---------- Key Vault ----------
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = "kv-${var.project}-${var.environment}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = ["Get", "List", "Set", "Delete"]
  }

  tags = {
    project = "SRE Copilot"
  }
}

# Guardamos el connection string de App Insights como secreto
# (buena práctica: la Function lo leerá de Key Vault, no de app settings)
resource "azurerm_key_vault_secret" "appinsights_connection" {
  name         = "appinsights-connection-string"
  value        = azurerm_application_insights.main.connection_string
  key_vault_id = azurerm_key_vault.main.id
}

# Clave de Azure OpenAI: la genera la cuenta, el copilot la lee del vault
resource "azurerm_key_vault_secret" "azure_openai_api_key" {
  name         = "azure-openai-api-key"
  value        = azurerm_cognitive_account.openai.primary_access_key
  key_vault_id = azurerm_key_vault.main.id
}

# Clave de Azure AI Search (memoria de incidentes)
resource "azurerm_key_vault_secret" "azure_search_api_key" {
  name         = "azure-search-api-key"
  value        = azurerm_search_service.memory.primary_key
  key_vault_id = azurerm_key_vault.main.id
}

# Token de GitHub: llega por variable de entorno (TF_VAR_github_token) y nunca
# se escribe en un archivo del repo
resource "azurerm_key_vault_secret" "github_token" {
  name         = "github-token"
  value        = var.github_token
  key_vault_id = azurerm_key_vault.main.id
}

# Token de la API de Dynatrace
resource "azurerm_key_vault_secret" "dynatrace_api_token" {
  name         = "dynatrace-api-token"
  value        = var.dynatrace_api_token
  key_vault_id = azurerm_key_vault.main.id
}

# ---------- Lectura de los secretos ----------
# La Function App toma las claves del vault (no del estado de Terraform).
# El depends_on fuerza a que la lectura ocurra durante el apply: en el primer
# despliegue el secreto todavía no existe en Azure.
data "azurerm_key_vault_secret" "azure_openai_api_key" {
  name         = azurerm_key_vault_secret.azure_openai_api_key.name
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_secret.azure_openai_api_key]
}

data "azurerm_key_vault_secret" "azure_search_api_key" {
  name         = azurerm_key_vault_secret.azure_search_api_key.name
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_secret.azure_search_api_key]
}

data "azurerm_key_vault_secret" "github_token" {
  name         = azurerm_key_vault_secret.github_token.name
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_secret.github_token]
}

data "azurerm_key_vault_secret" "dynatrace_api_token" {
  name         = azurerm_key_vault_secret.dynatrace_api_token.name
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_secret.dynatrace_api_token]
}

# ---------- Azure OpenAI (LLM del copilot) ----------
# kind = "OpenAI": es el recurso estable del provider azurerm 3.x para Azure
# OpenAI (azurerm_ai_services es de la rama 4.x).
resource "azurerm_cognitive_account" "openai" {
  name                = "oai-${var.project}-${var.environment}${var.name_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  kind                = "OpenAI"
  sku_name            = "S0"

  # Subdominio propio: es lo que espera el SDK @azure/openai cuando la
  # autenticación es por clave y evita redirecciones del endpoint estándar.
  custom_subdomain_name = "${var.project}-${var.environment}${var.name_suffix}"

  tags = {
    project = "SRE Copilot"
  }
}

# Despliegue del modelo (gpt-4o por defecto). El nombre es el valor de
# AZURE_OPENAI_DEPLOYMENT que usa el copilot.
resource "azurerm_cognitive_deployment" "chat" {
  name                 = var.openai_deployment_name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.openai_model_name
    version = var.openai_model_version
  }

  scale {
    type     = "Standard"
    capacity = var.openai_deployment_capacity
  }
}

# ---------- Azure AI Search (memoria de incidentes) ----------
resource "azurerm_search_service" "memory" {
  name                = "srch-${var.project}-${var.environment}${var.name_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = var.search_sku

  # 1 réplica / 1 partición es suficiente para el volumen del demo y es lo
  # más barato que puede hacer el índice.
  replica_count   = 1
  partition_count = 1

  tags = {
    project = "SRE Copilot"
  }
}

# El provider azurerm 3.x no tiene recurso para el índice, así que se crea con
# la CLI de Azure usando el MISMO fichero JSON que está versionado en el repo
# (search-index.json): la definición del índice vive en el repositorio, no en
# el portal. Requiere Azure CLI 2.51+ autenticado (lo hace el job de deploy).
resource "terraform_data" "search_index" {
  triggers_replace = [
    azurerm_search_service.memory.primary_key,
    filebase64sha256("${path.module}/search-index.json"),
  ]

  provisioner "local-exec" {
    command = <<-EOT
      az search index create \
        --service-name "${azurerm_search_service.memory.name}" \
        --name "${var.search_index_name}" \
        --admin-key "$(az search admin key show --service-name "${azurerm_search_service.memory.name}" --query primaryKey --output tsv)" \
        --parameters "${path.module}/search-index.json"
    EOT
  }
}

# ---------- Static Web App (dashboard React) ----------
# Aloja el frontend compilado (Vite) que publica el workflow de deploy.
resource "azurerm_static_web_app" "frontend" {
  name                = "swa-${var.project}-${var.environment}${var.name_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku_tier            = "Free"

  tags = {
    project = "SRE Copilot"
  }
}
