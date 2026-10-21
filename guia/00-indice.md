# 🚩 Guía de Comandos — Competencia Hackathon
## Azure · Dynatrace · Terraform · GitHub · KQL

**Kit de referencia rápida desde cero.** Cada documento es independiente — imprímelos o tenlos abiertos en pestañas durante la competencia.

---

## 📑 Contenido

| # | Documento | Para qué sirve |
|---|---|---|
| 01 | [Azure CLI](01-azure-cli.md) | Gestión completa de recursos Azure desde terminal |
| 02 | [Dynatrace](02-dynatrace.md) | Playground, OneAgent, APIs REST, Davis AI |
| 03 | [Terraform](03-terraform.md) | Infraestructura como código |
| 04 | [Git y GitHub Actions](04-git-github-actions.md) | Control de versiones y CI/CD |
| 05 | [KQL](05-kql.md) | Consultas de observabilidad en Application Insights |

---

## ⚡ Flujo de emergencia (los 10 comandos que salvan vidas)

```bash
# 1. Verificar identidad en Azure
az account show

# 2. Ver logs de una app que falla (¡el más usado en troubleshooting!)
az webapp log tail --name app-srecopilot-api-dev --resource-group rg-srecopilot-dev

# 3. Ejecutar KQL desde terminal
az monitor app-insights query --app appi-srecopilot-dev --analytics-query "exceptions | count"

# 4. Estado de Terraform
terraform plan

# 5. Limpiar si todo falla
terraform destroy
```

---

## 🎯 Convenciones usadas en esta guía

- `<valor>` = reemplazar con tu dato (ej: `<nombre-app>` → `app-srecopilot-api-dev`)
- Los valores del ejemplo usan los nombres del proyecto SRE Copilot
- `$` al inicio indica variable de entorno (Linux/Mac) — en Windows CMD quita el `$`
