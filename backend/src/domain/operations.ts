/**
 * Nombres de operacion.
 *
 * El copilot busca las peticiones por `operation_Name` en las KQL de
 * Application Insights (CONTRACTS.md §7). Cada ruta de negocio declara aqui su
 * nombre y el backend lo expone en tres sitios: cabecera `x-operation-name`,
 * log estructurado y atributo del span de OpenTelemetry.
 */

export const OperationName = {
  Health: 'Health',
  Catalog: 'Catalog',
  Checkout: 'Checkout',
  Payment: 'Payment',
  Inventory: 'Inventory',
  Chaos: 'Chaos',
  Unknown: 'Unknown',
} as const;

export type OperationName = (typeof OperationName)[keyof typeof OperationName];

/**
 * Registro ruta -> operation name.
 *
 * Se rellena al construir la app (ver `src/app.ts`), de modo que el middleware
 * de contexto puede resolver el nombre de la operacion *antes* de que se
 * ejecute el handler, y asi nombrar el span raiz de la peticion.
 */
export class OperationRegistry {
  private readonly byPath = new Map<string, OperationName>();

  register(path: string, operationName: OperationName): void {
    this.byPath.set(normalizePath(path), operationName);
  }

  resolve(path: string): OperationName {
    return this.byPath.get(normalizePath(path)) ?? OperationName.Unknown;
  }
}

export function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}
