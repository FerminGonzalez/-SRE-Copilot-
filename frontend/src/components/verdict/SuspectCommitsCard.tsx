import { formatDateTime } from "../../lib/format";
import type { EvidenceItem, SuspectCommit } from "../../types/contract";
import { Card } from "../ui/Card";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";

export interface SuspectCommitsCardProps {
  commits: SuspectCommit[];
  /**
   * Evidencia completa del veredicto.
   *
   * El contrato §1 no mete el diff dentro de `SuspectCommit`: el diff viaja
   * como evidencia de tipo `diff` (CONTRACTS.md §8.3 pide mostrar los commits
   * sospechosos *con* su diff). Aquí se empareja cada commit con su diff.
   */
  evidence?: EvidenceItem[];
}

/**
 * ¿La evidencia corresponde a este commit?
 *
 * La evidencia de diff lleva la URL del commit en `source`, así que se
 * empareja por URL o por el propio sha.
 */
function matchesCommit(evidence: EvidenceItem, commit: SuspectCommit): boolean {
  if (evidence.kind !== "diff") {
    return false;
  }
  if (commit.url && evidence.source === commit.url) {
    return true;
  }
  return commit.sha.length > 0 && evidence.source.includes(commit.sha);
}

/** Commits sospechosos: sha, mensaje, autor, fecha, por qué y su diff. */
export function SuspectCommitsCard({ commits, evidence = [] }: SuspectCommitsCardProps) {
  return (
    <Card
      title="Commits sospechosos"
      icon="commit"
      headingId="verdict-commits-title"
      actions={
        commits.length > 0 ? (
          <span className="chip chip--muted mono">{commits.length}</span>
        ) : null
      }
    >
      {commits.length === 0 ? (
        <EmptyState
          icon="commit"
          title="Sin commits sospechosos"
          description="El copilot no ha identificado ningún commit relacionado con el incidente."
        />
      ) : (
        <ul className="stack-list">
          {commits.map((commit) => {
            const diffs = evidence.filter((item) => matchesCommit(item, commit));
            return (
              <li key={commit.sha} className="commit">
                <div className="commit__head">
                  <span className="sha">{commit.sha}</span>
                  <ConfidenceBadge confidence={commit.confidence} withLabel={false} />
                </div>

                <p className="commit__message">{commit.message}</p>

                <div className="commit__meta">
                  <span>
                    <Icon name="user" size={11} /> {commit.author}
                  </span>
                  <span>{formatDateTime(commit.date)}</span>
                </div>

                <p className="commit__why">
                  <strong style={{ color: "var(--text-secondary)" }}>Por qué se suspiciona: </strong>
                  {commit.why}
                </p>

                {diffs.length > 0 ? (
                  <div className="commit__diffs">
                    {diffs.map((diff) => (
                      <details key={diff.id} className="commit__diff">
                        <summary>
                          <span className="mono">{diff.title}</span>
                        </summary>
                        <pre className="codeblock">{diff.detail}</pre>
                      </details>
                    ))}
                  </div>
                ) : null}

                {commit.url ? (
                  <p style={{ marginTop: "var(--sp-2)" }}>
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono"
                      style={{ fontSize: "var(--fs-xs)" }}
                    >
                      <Icon name="external" size={12} /> Ver el commit en GitHub
                    </a>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
