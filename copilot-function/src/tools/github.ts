/**
 * Herramientas contra la API de GitHub (CONTRACTS.md §3).
 *
 * - `list_recent_commits`  · commits recientes del repo/servicio
 * - `get_commit_diff`      · diff de un commit (archivos y cambios)
 * - `blame_deploy_window`  · commits dentro de la ventana del incidente
 *
 * Requieren `GITHUB_TOKEN` y `GITHUB_REPO` (formato `owner/repo`).
 * Sin ellos se usa el dataset offline determinista.
 */

import { z } from "zod";
import type { AppConfig } from "../config";
import type { Tool, ToolContext, ToolResult } from "../core/types";
import type {
  CommitDiff,
  CommitDiffData,
  CommitFile,
  CommitInfo,
  CommitListData,
  DeployWindowData,
} from "./data";
import { buildOfflineDataset } from "./offline";
import { formatZodError, jsonSchemaFromZod } from "./schema";

/** Error de configuración de GitHub. */
export class GitHubNotConfiguredError extends Error {
  public constructor() {
    super("GitHub no está configurado: define GITHUB_TOKEN y GITHUB_REPO (owner/repo).");
    this.name = "GitHubNotConfiguredError";
  }
}

/** Cliente mínimo de la API de GitHub. */
export interface GitHubClient {
  readonly configured: boolean;
  readonly repo?: string;
  listCommits(options: { limit: number; since?: string; until?: string }): Promise<CommitInfo[]>;
  getCommit(sha: string): Promise<CommitDiff>;
}

const GITHUB_API = "https://api.github.com";

/** Cliente real contra api.github.com. */
export class RealGitHubClient implements GitHubClient {
  public readonly configured = true;

  public constructor(
    private readonly token: string,
    public readonly repo: string,
    private readonly timeoutMs = 15_000,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sre-copilot",
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub respondió ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  public async listCommits(options: {
    limit: number;
    since?: string;
    until?: string;
  }): Promise<CommitInfo[]> {
    const params = new URLSearchParams({ per_page: String(Math.min(options.limit, 100)) });
    if (options.since) {
      params.set("since", options.since);
    }
    if (options.until) {
      params.set("until", options.until);
    }
    const raw = await this.request<unknown[]>(
      `/repos/${this.repo}/commits?${params.toString()}`,
    );
    return raw.map((item) => mapCommit(item as GitHubCommit));
  }

  public async getCommit(sha: string): Promise<CommitDiff> {
    const raw = await this.request<GitHubCommit>(`/repos/${this.repo}/commits/${sha}`);
    return mapCommitDiff(raw);
  }
}

/** Cliente que falla siempre: se usa cuando no hay credenciales. */
export class UnconfiguredGitHubClient implements GitHubClient {
  public readonly configured = false;
  public readonly repo?: string;

  public async listCommits(): Promise<CommitInfo[]> {
    throw new GitHubNotConfiguredError();
  }

  public async getCommit(): Promise<CommitDiff> {
    throw new GitHubNotConfiguredError();
  }
}

/** Crea el cliente de GitHub a partir de la configuración. */
export function createGitHubClient(config: AppConfig): GitHubClient {
  const { token, repo } = config.github;
  if (token && repo) {
    return new RealGitHubClient(token, repo);
  }
  return new UnconfiguredGitHubClient();
}

/* -------------------------------------------------------------------------- */
/* Mapeo de la API de GitHub                                                    */
/* -------------------------------------------------------------------------- */

interface GitHubCommit {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
  files?: Array<{
    filename?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    patch?: string;
  }>;
}

function mapCommit(raw: GitHubCommit): CommitInfo {
  const message = raw.commit?.message ?? "";
  return {
    sha: raw.sha ?? "",
    message: message.split("\n")[0] ?? message,
    author: raw.author?.login ?? raw.commit?.author?.name ?? "desconocido",
    date: raw.commit?.author?.date ?? new Date(0).toISOString(),
    url: raw.html_url ?? "",
  };
}

function mapCommitDiff(raw: GitHubCommit): CommitDiff {
  const base = mapCommit(raw);
  const files: CommitFile[] = (raw.files ?? []).map((file) => {
    const mapped: CommitFile = {
      filename: file.filename ?? "",
      status: file.status ?? "modified",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    };
    return file.patch ? { ...mapped, patch: file.patch } : mapped;
  });
  return { ...base, files };
}

/* -------------------------------------------------------------------------- */
/* Esquemas de argumentos                                                       */
/* -------------------------------------------------------------------------- */

/** Argumentos de `list_recent_commits`. */
export const listCommitsArgsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  since: z.string().min(1).optional(),
});

/** Argumentos de `get_commit_diff`. */
export const commitDiffArgsSchema = z.object({
  sha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "el sha debe tener entre 7 y 40 caracteres hexadecimales"),
});

/** Argumentos de `blame_deploy_window`. */
export const deployWindowArgsSchema = z.object({
  windowMinutes: z.number().int().min(1).max(1440).optional(),
  since: z.string().min(1).optional(),
  until: z.string().min(1).optional(),
});

function failure(summary: string, error: string, startedAt: number): ToolResult {
  return { ok: false, summary, error, durationMs: Date.now() - startedAt };
}

/* -------------------------------------------------------------------------- */
/* Herramientas                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `list_recent_commits` — commits recientes del repo/servicio vía GitHub API.
 */
export function createListRecentCommitsTool(client: GitHubClient): Tool {
  return {
    name: "list_recent_commits",
    description: "Commits recientes del repo/servicio vía GitHub API.",
    parameters: jsonSchemaFromZod(listCommitsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = listCommitsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para list_recent_commits",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const limit = parsed.data.limit ?? 10;
      const since =
        parsed.data.since ?? new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();

      if (client.configured) {
        try {
          const commits = await client.listCommits({ limit, since });
          const data: CommitListData = {
            mode: "live",
            ...(client.repo ? { repo: client.repo } : {}),
            commits,
          };
          const latest = commits[0];
          return {
            ok: true,
            summary: latest
              ? `${commits.length} commits desde ${since}; último ${latest.sha.slice(0, 7)}: ${latest.message}`
              : "Sin commits en el rango",
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló la consulta de commits a GitHub",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const commits = dataset.commits.slice(0, limit);
      const data: CommitListData = { mode: "offline", commits };
      const latest = commits[0];
      return {
        ok: true,
        summary: latest
          ? `[offline] ${commits.length} commits; último ${latest.sha.slice(0, 7)}: ${latest.message}`
          : "[offline] Sin commits en el rango",
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * `get_commit_diff` — diff de un commit (archivos y cambios).
 */
export function createGetCommitDiffTool(client: GitHubClient): Tool {
  return {
    name: "get_commit_diff",
    description: "Diff de un commit (archivos y cambios).",
    parameters: jsonSchemaFromZod(commitDiffArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = commitDiffArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para get_commit_diff",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const sha = parsed.data.sha.toLowerCase();

      if (client.configured) {
        try {
          const commit = await client.getCommit(sha);
          const data: CommitDiffData = { mode: "live", commit };
          return {
            ok: true,
            summary: `${commit.files.length} ficheros en ${commit.sha.slice(0, 7)}: ${commit.files
              .map((file) => file.filename)
              .join(", ")}`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló la consulta del diff a GitHub",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const commit = dataset.diffs.get(sha) ?? dataset.diffs.get(sha.slice(0, 7));
      if (!commit) {
        return failure(
          `[offline] No hay diff conocido para ${sha.slice(0, 7)}`,
          `commit ${sha} no está en el dataset offline`,
          startedAt,
        );
      }
      const data: CommitDiffData = { mode: "offline", commit };
      return {
        ok: true,
        summary: `[offline] ${commit.files.length} ficheros en ${commit.sha.slice(0, 7)}: ${commit.files
          .map((file) => file.filename)
          .join(", ")}`,
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * `blame_deploy_window` — commits dentro de la ventana del incidente.
 */
export function createBlameDeployWindowTool(client: GitHubClient): Tool {
  return {
    name: "blame_deploy_window",
    description: "Commits dentro de la ventana del incidente.",
    parameters: jsonSchemaFromZod(deployWindowArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = deployWindowArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para blame_deploy_window",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const windowMinutes = parsed.data.windowMinutes ?? ctx.windowMinutes;
      const since =
        parsed.data.since ?? new Date(ctx.now.getTime() - windowMinutes * 60_000).toISOString();
      const until = parsed.data.until ?? ctx.now.toISOString();

      if (client.configured) {
        try {
          const commits = await client.listCommits({ limit: 50, since, until });
          const data: DeployWindowData = {
            mode: "live",
            windowMinutes,
            since,
            until,
            commits,
          };
          return {
            ok: true,
            summary: `${commits.length} commits entre ${since} y ${until}`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló el listado de commits de la ventana a GitHub",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const from = Date.parse(since);
      const to = Date.parse(until);
      const commits = dataset.commits.filter((commit) => {
        const date = Date.parse(commit.date);
        return date >= from && date <= to;
      });
      const data: DeployWindowData = {
        mode: "offline",
        windowMinutes,
        since,
        until,
        commits,
      };
      return {
        ok: true,
        summary: `[offline] ${commits.length} commits entre ${since} y ${until}`,
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/** Crea las tres herramientas de GitHub. */
export function createGitHubTools(config: AppConfig): Tool[] {
  const client = createGitHubClient(config);
  return [
    createListRecentCommitsTool(client),
    createGetCommitDiffTool(client),
    createBlameDeployWindowTool(client),
  ];
}
