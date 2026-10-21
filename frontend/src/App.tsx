import { useCallback, useState } from "react";
import { getCopilotBaseUrl, getIncident } from "./api/client";
import { IncidentsView } from "./components/incidents/IncidentsView";
import { LiveView } from "./components/live/LiveView";
import { Sidebar, type ViewId } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { VerdictView } from "./components/verdict/VerdictView";
import { useHealth } from "./hooks/useHealth";
import { useLiveDiagnosis } from "./hooks/useLiveDiagnosis";
import type { Verdict } from "./types/contract";

const VIEW_META: Record<ViewId, { title: string; subtitle: string }> = {
  incidents: {
    title: "Incidentes",
    subtitle: "Diagnósticos previos del copilot",
  },
  live: {
    title: "Diagnóstico en vivo",
    subtitle: "Stream SSE del copilot",
  },
  verdict: {
    title: "Veredicto",
    subtitle: "Análisis completo del incidente",
  },
};

export default function App() {
  const [view, setView] = useState<ViewId>("incidents");
  const [environment, setEnvironment] = useState("production");
  const [verdict, setVerdict] = useState<Verdict | undefined>(undefined);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | undefined>(undefined);
  const [activeIncidentId, setActiveIncidentId] = useState<string | undefined>(undefined);

  const handleVerdictReady = useCallback((loaded: Verdict) => {
    setVerdict(loaded);
    setActiveIncidentId(loaded.incidentId);
  }, []);

  const live = useLiveDiagnosis({ onVerdict: handleVerdictReady });
  const busy = live.state.status === "running";

  const health = useHealth();
  const copilotUrl = getCopilotBaseUrl();

  const openIncident = useCallback(async (incidentId: string) => {
    setView("verdict");
    setActiveIncidentId(incidentId);
    setVerdictLoading(true);
    setVerdictError(undefined);
    try {
      const loaded = await getIncident(incidentId);
      setVerdict(loaded);
    } catch (caught) {
      setVerdict(undefined);
      setVerdictError(
        caught instanceof Error
          ? caught.message
          : "No se ha podido cargar el veredicto del incidente.",
      );
    } finally {
      setVerdictLoading(false);
    }
  }, []);

  const meta = VIEW_META[view];

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onNavigate={setView}
        verdictId={verdict?.incidentId}
        copilotUrl={copilotUrl}
      />

      <div className="main">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          environment={environment}
          copilotUrl={copilotUrl}
          health={health}
          busy={busy}
        />

        <main className="content" id="contenido">
          {view === "incidents" ? (
            <IncidentsView
              onOpenIncident={(incidentId) => {
                void openIncident(incidentId);
              }}
              activeIncidentId={activeIncidentId}
            />
          ) : null}

          {view === "live" ? (
            <LiveView
              environment={environment}
              onEnvironmentChange={setEnvironment}
              state={live.state}
              onRun={(request) => {
                void live.run(request);
              }}
              onReset={live.reset}
            />
          ) : null}

          {view === "verdict" ? (
            <VerdictView
              verdict={verdict}
              loading={verdictLoading}
              error={verdictError}
              onRetry={
                activeIncidentId
                  ? () => {
                      void openIncident(activeIncidentId);
                    }
                  : undefined
              }
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
