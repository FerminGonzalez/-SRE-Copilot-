/**
 * Entornos soportados por el copilot para acotar las consultas KQL.
 * Vive en su propio módulo para que el componente de formulario no exporte
 * nada más que componentes (regla `react-refresh/only-export-components`).
 */
export const ENVIRONMENTS = ["production", "staging", "development"] as const;

export const DEFAULT_ENVIRONMENT = "production";
