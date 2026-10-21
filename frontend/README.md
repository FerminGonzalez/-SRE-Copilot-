# SRE Copilot · Frontend

> Dashboard React del diagnóstico de incidentes de **SRE Copilot**.
> Muestra los diagnósticos anteriores, ejecuta un diagnóstico en vivo sobre el
> stream SSE del copilot y presenta el veredicto completo en tarjetas.

Cumple la sección **8 (Frontend)** de [`../CONTRACTS.md`](../CONTRACTS.md) y consume
exactamente los esquemas definidos en las secciones **1** (veredicto) y **2** (API y
eventos SSE).

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # ajusta VITE_COPILOT_URL si hace falta
npm run dev                  # http://localhost:5173
```

El backend que hay que tener en marcha es el copilot (`copilot-function`), que expone
el prefijo `/api` en `http://localhost:7071/api` por defecto.

### Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite. |
| `npm run build` | `typecheck` + build de producción en `dist/`. |
| `npm run preview` | Sirve el build de producción. |
| `npm run typecheck` | `tsc --noEmit` en modo estricto. |
| `npm run lint` | ESLint (flat config) sobre todo el proyecto. |
| `npm test` | Vitest + Testing Library, sin red y sin credenciales. |
| `npm run test:watch` | Vitest en modo watch. |

## Configuración

| Variable | Default | Para qué sirve |
|---|---|---|
| `VITE_COPILOT_URL` | `http://localhost:7071/api` | URL base del copilot (prefijo `/api`). |

Es la **única** variable que necesita el frontend. No hay claves, tokens ni secretos:
el copilot es quien se autentica contra Azure. `.env.example` no contiene ningún valor
sensible y `.env.local` está en `.gitignore`.

## Estructura

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts        # endpoints del contrato (§2) + lectura del SSE
│   │   └── sse.ts           # parser SSE incremental y validación de eventos
│   ├── components/
│   │   ├── evidence/        # lista de evidencia plegable (compartida)
│   │   ├── incidents/       # vista «Incidentes»
│   │   ├── layout/          # shell, barra lateral, barra superior, conexión
│   │   ├── live/            # vista «Diagnóstico en vivo»
│   │   ├── ui/              # primitivas (Icon, Card, Banner, EmptyState…)
│   │   └── verdict/         # vista «Veredicto» y sus tarjetas
│   ├── hooks/               # useHealth, useIncidents, useLiveDiagnosis
│   ├── lib/
│   │   ├── format.ts        # fechas, duraciones y etiquetas (es-ES)
│   │   └── streamReducer.ts # reducer puro de eventos SSE → estado de la vista
│   ├── styles/              # tokens.css, base.css, layout.css, components.css, views.css
│   ├── types/contract.ts    # tipos del contrato (§1 y §2), sin desviaciones
│   ├── App.tsx              # shell y navegación entre las tres vistas
│   └── main.tsx
└── ...
```

## Las tres vistas

### 1. Incidentes

`GET /api/incidents?service=&limit=`. Lista los diagnósticos previos con servicio,
confianza, resumen, causa raíz, etiquetas y feedback. Al pulsar una fila se pide
`GET /api/incidents/:id` y se abre el veredicto completo en la vista 3.

### 2. Diagnóstico en vivo

`POST /api/diagnose` con `{ service, environment?, windowMinutes?, symptom? }`.

Como el endpoint es un **POST**, no se puede usar `EventSource`: el stream se consume
con `fetch` + `Accept: text/event-stream` y se lee el `ReadableStream` del cuerpo con un
`TextDecoder` en modo streaming (`src/api/sse.ts`). Los eventos se reducen a estado con
un reducer puro (`src/lib/streamReducer.ts`) y se pintan en este orden:

1. **Plan** — hipótesis y pasos de investigación.
2. **Llamadas a herramientas** — una por fila, con su duración en monoespaciado; la
   que está en vuelo muestra un spinner y el texto «en curso».
3. **Evidencia acumulada** — se añade cada `evidence` sin bloquear el stream.
4. **Veredicto final** — resumen, causa raíz y confianza.

Además hay una **consola** en monoespaciado con todos los eventos en orden de llegada.
El evento `error` del contrato se muestra como aviso visible, no se traga en silencio.

### 3. Veredicto

Tarjetas con causa raíz y resumen, confianza, commits sospechosos (sha, mensaje, autor,
fecha y por qué se suspiciona), línea de tiempo vertical con color por severidad,
evidencia plegable por elemento, recomendaciones, límites del análisis
(`uncertainties`), incidentes relacionados y el control de feedback
(`POST /api/incidents/:id/feedback` con `correct` / `partially` / `incorrect` y una nota
opcional).

## Accesibilidad

- HTML semántico: `header`, `nav`, `main`, `section` con `aria-labelledby`, listas reales
  (`ul`/`ol`) en timeline, evidencia, commits y recomendaciones.
- Cada control tiene su `label` asociado por `htmlFor`/`id`; los campos obligatorios se
  validan con `aria-invalid` y un mensaje de error enlazado con `aria-describedby`.
- Foco visible en todos los elementos interactivos (`:focus-visible` con anillo de 2 px).
- El color nunca es el único indicio: la severidad del timeline, la confianza y el
  estado de conexión van siempre acompañados de texto.
- Región `role="status"` / `aria-live="polite"` para el avance del diagnóstico y la
  consola del stream (`role="log"`).
- La evidencia plegable usa `aria-expanded` + `aria-controls`.
- Contraste verificado sobre el fondo oscuro (texto principal `#E9F0F6` sobre `#050D16`
  ≈ 15:1; texto secundario ≈ 8:1).
- `prefers-reduced-motion: reduce` desactiva animaciones y transiciones.

## Diseño

Paleta de la casa declarada como variables CSS en `src/styles/tokens.css`:

| Color | Uso |
|---|---|
| `#0E2841` navy | superficies y fondos de la consola |
| `#156082` teal | acento, acciones primarias, foco |
| `#E97132` orange | avisos, severidad `warning` |
| `#196B24` green | éxito, severidad informativa, confianza alta |
| `#E8E8E8` grey | texto y bordes neutros |

Tipografía: sans de sistema para la interfaz y monoespaciada para shas, duraciones y
salida de log.

## Tests

`npm test` corre sin red y sin credenciales. Cubre:

| Fichero | Qué comprueba |
|---|---|
| `src/test/streamReducer.test.ts` | el reducer de eventos SSE (plan, herramientas, evidencia, veredicto, error, `done`, no mutación). |
| `src/test/sse.test.ts` | el parser SSE: eventos partidos entre chunks, CRLF, comentarios, JSON inválido. |
| `src/test/TimelineCard.test.tsx` | la línea de tiempo: orden cronológico, color y texto de severidad, estado vacío. |
| `src/test/VerdictView.test.tsx` | las tarjetas del veredicto, la evidencia plegable y el envío de feedback. |
| `src/test/IncidentsView.test.tsx` | la lista de incidentes, el filtro por servicio y los estados de error/vacío. |
| `src/test/LiveView.test.tsx` | el consumo real del stream SSE y la visibilidad del evento `error`. |

## Notas de contrato

- Los tipos de `src/types/contract.ts` reproducen literalmente la sección 1 del
  contrato. **No se han hecho desviaciones.** Si el copilot evoluciona el esquema, hay
  que actualizar ese fichero (y solo ese) de forma coordinada.
- El frontend solo usa `VITE_COPILOT_URL`. No hay credenciales ni endpoints de
  producción en el repositorio.
