variable "project" {
  description = "Prefijo para nombrar todos los recursos"
  type        = string
  default     = "srecopilot"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,15}$", var.project))
    error_message = "project debe ser minúsculas alfanuméricas y tener entre 2 y 16 caracteres (ej. srecopilot)."
  }
}

variable "location" {
  description = "Región de Azure (eastus, eastus2, westeurope, ...)"
  type        = string
  default     = "eastus"

  validation {
    condition     = length(trimspace(var.location)) > 2
    error_message = "location debe ser el nombre de una región de Azure (ej. eastus o eastus2)."
  }
}

variable "environment" {
  description = "Ambiente: dev, staging, prod"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment debe ser uno de: dev, staging, prod."
  }
}

variable "name_suffix" {
  description = "Sufijo opcional para los recursos con nombre global (Azure OpenAI, AI Search, Static Web App)"
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^[a-z0-9-]{0,10}$", var.name_suffix))
    error_message = "name_suffix solo admite minúsculas, números y guiones (máx. 10 caracteres)."
  }
}

# ---------- LLM (Azure OpenAI) ----------
variable "llm_provider" {
  description = "Proveedor de LLM que usa la Function: azure-openai, anthropic o mock"
  type        = string
  default     = "azure-openai"

  validation {
    condition     = contains(["azure-openai", "anthropic", "mock"], var.llm_provider)
    error_message = "llm_provider debe ser uno de: azure-openai, anthropic, mock."
  }
}

variable "openai_deployment_name" {
  description = "Nombre del despliegue de Azure OpenAI (valor de AZURE_OPENAI_DEPLOYMENT)"
  type        = string
  default     = "gpt-4o"

  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$", var.openai_deployment_name))
    error_message = "openai_deployment_name solo admite letras, números y guiones (máx. 64 caracteres)."
  }
}

variable "openai_model_name" {
  description = "Modelo de Azure OpenAI que se despliega (gpt-4o, gpt-4o-mini, gpt-4.1, ...)"
  type        = string
  default     = "gpt-4o"

  validation {
    condition     = length(trimspace(var.openai_model_name)) > 0
    error_message = "openai_model_name no puede estar vacío."
  }
}

variable "openai_model_version" {
  description = "Versión del modelo de Azure OpenAI que se despliega"
  type        = string
  default     = "2024-08-06"

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", var.openai_model_version))
    error_message = "openai_model_version debe tener el formato AAAA-MM-DD (ej. 2024-08-06)."
  }
}

variable "openai_deployment_capacity" {
  description = "Capacidad del despliegue de Azure OpenAI (TPM en miles de tokens por minuto)"
  type        = number
  default     = 30

  validation {
    condition     = var.openai_deployment_capacity >= 1 && var.openai_deployment_capacity <= 1000
    error_message = "openai_deployment_capacity debe estar entre 1 y 1000 (miles de TPM)."
  }
}

# ---------- Memoria de incidentes (Azure AI Search) ----------
variable "search_index_name" {
  description = "Nombre del índice de Azure AI Search con la memoria de incidentes (debe coincidir con search-index.json)"
  type        = string
  default     = "incidents"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,62}$", var.search_index_name))
    error_message = "search_index_name debe empezar por minúscula y solo admitir letras, números y guiones."
  }
}

variable "search_sku" {
  description = "SKU de Azure AI Search (free, basic, standard, standard2, standard3)"
  type        = string
  default     = "standard"

  validation {
    condition     = contains(["free", "basic", "standard", "standard2", "standard3"], var.search_sku)
    error_message = "search_sku debe ser uno de: free, basic, standard, standard2, standard3."
  }
}

# ---------- GitHub ----------
variable "github_repo" {
  description = "Repositorio de GitHub en formato owner/repo que consulta el copilot (vacío = integración desactivada)"
  type        = string
  default     = ""

  validation {
    condition     = var.github_repo == "" || can(regex("^[^/[:space:]]+/[^/[:space:]]+$", var.github_repo))
    error_message = "github_repo debe tener el formato owner/repo (ej. FerminGonzalez/SRE-Copilot)."
  }
}

variable "github_token" {
  description = "Token de GitHub (PAT o token de la App). Se guarda en Key Vault; nunca en el repositorio"
  type        = string
  sensitive   = true
}

# ---------- Dynatrace ----------
variable "dynatrace_api_url" {
  description = "URL de la API de Dynatrace (ej. https://<id>.playground.dynatrace.com). Vacío = integración desactivada"
  type        = string
  default     = ""

  validation {
    condition     = var.dynatrace_api_url == "" || can(regex("^https://", var.dynatrace_api_url))
    error_message = "dynatrace_api_url debe empezar por https:// o quedar vacío."
  }
}

variable "dynatrace_api_token" {
  description = "Token de la API de Dynatrace. Se guarda en Key Vault; nunca en el repositorio"
  type        = string
  sensitive   = true
}

# ---------- Observabilidad ----------
variable "log_retention_in_days" {
  description = "Días de retención de los datos en el Log Analytics Workspace"
  type        = number
  default     = 30

  validation {
    condition     = var.log_retention_in_days >= 7 && var.log_retention_in_days <= 730
    error_message = "log_retention_in_days debe estar entre 7 y 730 días."
  }
}

variable "log_daily_quota_gb" {
  description = "Cuota diaria de ingesta del Log Analytics Workspace en GB (controla el coste del demo)"
  type        = number
  default     = 1

  validation {
    condition     = var.log_daily_quota_gb > 0 && var.log_daily_quota_gb <= 100
    error_message = "log_daily_quota_gb debe estar entre 0 (ilimitado) y 100 GB."
  }
}

variable "app_insights_sampling_percentage" {
  description = "Porcentaje de muestreo de Application Insights (100 = sin sampling, recomendado para el demo)"
  type        = number
  default     = 100

  validation {
    condition     = var.app_insights_sampling_percentage >= 0 && var.app_insights_sampling_percentage <= 100
    error_message = "app_insights_sampling_percentage debe estar entre 0 y 100."
  }
}
