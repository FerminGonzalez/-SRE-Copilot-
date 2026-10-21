/**
 * Target de la base de datos.
 *
 * La infraestructura (infrastructure/main.tf) despliega el backend con un
 * `DATABASE_URL` deliberadamente mal configurado
 * (`postgres://wrong-host:5432/mydb`). Esa cadena de conexion es parte del
 * escenario de la demo: no se "arregla", se honra y se documenta para que el
 * copilot pueda deducir la causa raiz.
 */

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
  user?: string;
}

export const DEFAULT_DATABASE_URL = 'postgres://wrong-host:5432/mydb';

export function parseDatabaseUrl(url: string): DatabaseTarget {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, '');
    return {
      host: parsed.hostname || 'unknown-host',
      port: parsed.port ? Number.parseInt(parsed.port, 10) : 5432,
      database: database || 'unknown-db',
      ...(parsed.username ? { user: parsed.username } : {}),
    };
  } catch {
    // Una URL invalida tambien es un error de configuracion: lo tratamos como
    // "no podemos ni siquiera saber a donde connecting".
    return { host: 'unparseable-host', port: 5432, database: 'unknown-db' };
  }
}

/**
 * Version segura de la URL de base de datos para los logs.
 *
 * La cadena de conexion puede llevar usuario y contrasena (`DATABASE_URL`),
 * asi que al loguearla se quitan las credenciales: en el log solo queda
 * host, puerto y base de datos.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }
    return parsed.toString();
  } catch {
    return 'unparseable-url';
  }
}
