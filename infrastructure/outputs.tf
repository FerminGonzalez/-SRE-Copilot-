output "resource_group_name" {
  description = "Resource Group creado"
  value       = azurerm_resource_group.main.name
}

output "api_url" {
  description = "URL de la API de ejemplo"
  value       = "https://${azurerm_linux_web_app.api.default_hostname}"
}

output "api_app_name" {
  description = "Nombre del App Service de la API de ejemplo (destino del deploy)"
  value       = azurerm_linux_web_app.api.name
}

output "app_insights_name" {
  description = "Nombre de Application Insights (para las consultas KQL)"
  value       = azurerm_application_insights.main.name
}

output "function_app_name" {
  description = "Nombre de la Function App del Copilot"
  value       = azurerm_linux_function_app.copilot.name
}

output "key_vault_name" {
  description = "Nombre del Key Vault"
  value       = azurerm_key_vault.main.name
}

output "app_id" {
  description = "App ID de Application Insights (lo usará la Function para consultar KQL)"
  value       = azurerm_application_insights.main.app_id
}

# ---------- Salidas nuevas ----------
output "function_app_default_hostname" {
  description = "Hostname de la Function App del Copilot"
  value       = azurerm_linux_function_app.copilot.default_hostname
}

output "copilot_api_base_url" {
  description = "URL base de la API del copilot (la usa el frontend en VITE_COPILOT_URL)"
  value       = "https://${azurerm_linux_function_app.copilot.default_hostname}/api"
}

output "storage_account_name" {
  description = "Storage Account que usa la Function App"
  value       = azurerm_storage_account.functions.name
}

output "log_analytics_workspace_name" {
  description = "Nombre del Log Analytics Workspace (origen de las consultas KQL)"
  value       = azurerm_log_analytics_workspace.main.name
}

output "openai_account_name" {
  description = "Nombre de la cuenta de Azure OpenAI"
  value       = azurerm_cognitive_account.openai.name
}

output "openai_endpoint" {
  description = "Endpoint de Azure OpenAI (valor de AZURE_OPENAI_ENDPOINT)"
  value       = azurerm_cognitive_account.openai.endpoint
}

output "openai_deployment_name" {
  description = "Nombre del despliegue del modelo (valor de AZURE_OPENAI_DEPLOYMENT)"
  value       = azurerm_cognitive_deployment.chat.name
}

output "search_service_name" {
  description = "Nombre del servicio de Azure AI Search"
  value       = azurerm_search_service.memory.name
}

output "search_endpoint" {
  description = "Endpoint de Azure AI Search (valor de AZURE_SEARCH_ENDPOINT)"
  value       = "https://${azurerm_search_service.memory.name}.search.windows.net"
}

output "search_index_name" {
  description = "Nombre del índice de la memoria de incidentes (valor de AZURE_SEARCH_INDEX)"
  value       = var.search_index_name
}

output "static_web_app_name" {
  description = "Nombre de la Static Web App que aloja el dashboard"
  value       = azurerm_static_web_app.frontend.name
}

output "static_web_app_url" {
  description = "URL pública del dashboard React"
  value       = "https://${azurerm_static_web_app.frontend.default_host_name}"
}
