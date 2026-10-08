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
