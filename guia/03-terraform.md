# 03 — Comandos Terraform
## Infraestructura como código

---

## 🏁 1. Ciclo de vida completo (memoriza esta secuencia)

```bash
# PASO 0 — Una sola vez por proyecto
terraform init          # Descarga providers, prepara el backend

# PASO 1 — Siempre antes de aplicar
terraform fmt           # Formatea los archivos .tf (buena práctica)
terraform validate      # Verifica sintaxis (debe decir "Success!")
terraform plan          # Muestra qué creará/cambiará/borrá — NO aplica nada

# PASO 2 — Aplicar
terraform apply         # Pide confirmación (escribe "yes")
terraform apply -auto-approve   # Sin preguntar (¡cuidado!)

# PASO 3 — Limpiar (al final del hackathon, evita gastos)
terraform destroy       # Borra TODOS los recursos gestionados
terraform destroy -auto-approve
```

---

## 🔍 2. Comandos de inspección (los que responden preguntas del CTF)

```bash
# Ver recursos gestionados por este proyecto
terraform state list

# Ver el valor exacto de un output
terraform output
terraform output api_url              # Un output específico
terraform output -raw api_url         # Sin comillas (útil para scripts)

# Ver detalle de UN recurso en el estado
terraform state show azurerm_linux_web_app.api

# Renombrar un recurso sin destruirlo
terraform state mv azurerm_linux_web_app.old azurerm_linux_web_app.new

# Quitar del estado un recurso roto (NO lo borra en Azure)
terraform state rm azurerm_storage_account.broken
```

---

## 🛠️ 3. Comandos de rescate (¡cuando algo sale mal!)

```bash
# ERROR: "Resource already exists" en Azure pero no en tu estado
# → Importar el recurso existente al estado:
terraform import azurerm_resource_group.main /subscriptions/<sub-id>/resourceGroups/rg-srecopilot-dev

# ERROR: Cambiaste algo en el portal de Azure (drift)
# → Ver la diferencia:
terraform plan
# → Re-sincronizar el estado SIN aplicar cambios:
terraform apply -refresh-only

# ERROR: Estado corrupto / bloqueado (alguien más hizo apply)
# → Ver quién tiene el lock:
terraform force-unlock <lock-id>

# ERROR: "terraform apply" a medias quedó atrapado
# → Cancelar con Ctrl+C y luego:
terraform apply -refresh-only

# Quiero empezar de cero sin tocar Azure aún
rm terraform.tfstate*     # ¡Cuidado! Pierdes el mapeo; usa terraform destroy primero
```

---

## 📝 4. Sintaxis esencial de archivos .tf (referencia de escritura)

```hcl
# providers.tf — qué providers y versiones
terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 3.75" }
  }
}

provider "azurerm" { features {} }

# variables.tf — inputs parametrizables
variable "location" {
  type    = string
  default = "eastus"
}

# main.tf — los recursos
resource "azurerm_resource_group" "main" {
  name     = "rg-srecopilot-dev"
  location = var.location          # ← referencia a variable
  tags = { project = "SRE Copilot" }
}

# outputs.tf — valores de salida
output "api_url" {
  value = "https://${azurerm_linux_web_app.api.default_hostname}"
}

# Referencias entre recursos:
resource "azurerm_linux_web_app" "api" {
  service_plan_id = azurerm_service_plan.api.id     # ← dependencia implícita
  ...
}
```

**Reglas de oro de sintaxis:**
- `snake_case` en nombres de bloques y recursos
- `${}` para interpolar dentro de strings
- Las dependencias se crean SOLO por referencia (`azurerm_x.y.id`) — nunca por orden visual
- Comentarios: `#` o `//` para línea, `/* */` para bloque

---

## 📋 Tabla rápida: ¿qué comando uso para...?

| Situación | Comando |
|---|---|
| Ver qué creará sin crear nada | `terraform plan` |
| Corregir formato del código | `terraform fmt` |
| Verificar sintaxis | `terraform validate` |
| Ver la URL de mi app creada | `terraform output api_url` |
| Detectar cambios manuales en el portal | `terraform plan` (muestra el drift) |
| Importar recurso existente | `terraform import` |
| Borrar todo al terminar | `terraform destroy` |
