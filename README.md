# -SRE-Copilot-
Diagnóstico de incidentes asistido por IA
Un asistente que, al detectar una anomalía en Application Insights/Dynatrace, automáticamente
evita que los equipos pierden horas correlacionando logs, métricas y trazas.

#Arquitectura mínima

[App Service] → [Application Insights] → [Azure Monitor Alert]
       ↑                                        ↓
[GitHub Actions] → [GitHub API]         [Azure Function / API]
       ↑                                        ↓
[Terraform]                          [LLM Azure OpenAI] → [Frontend React]
                                               ↑
                                        [Dynatrace API]


Flujo paso a paso

Terraform despliega: Resource Group, App Service, Application Insights, Azure Function (o API en App Service), Key Vault.

GitHub Actions hace deploy de la app y, al final, envía un customEvent a Application Insights con commitSha, version y timestamp.

Alerta de Application Insights (basada en KQL) se dispara cuando hay >5 excepciones en 5 min. Llama a un webhook (Azure Function).

Azure Function ejecuta:

Consulta KQL: exceptions | where timestamp > ago(15m) | summarize count() by type, outerMessage, operation_Name

Consulta KQL: customEvents | where name == "Deploy" | top 1 by timestamp desc

Llama a GitHub API: /repos/{owner}/{repo}/commits/{sha} para obtener diff y mensaje.

Llama a Dynatrace API: /api/v2/problems?from=... para obtener problema correlacionado.

Envía todo a Azure OpenAI con un prompt que pida diagnóstico en lenguaje natural, citando evidencias.

Frontend muestra el diagnóstico, la línea de tiempo y los enlaces a KQL/GitHub/Dynatrace.
