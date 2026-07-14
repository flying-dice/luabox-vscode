import * as vscode from "vscode";
import { execFile } from "child_process";

/**
 * Resolve the `luabox` binary from the `luabox.path` setting, falling back to
 * PATH. This is the SAME resolution the language client uses (see extension.ts)
 * so every CLI call and the LSP agree on which binary they run.
 */
export function resolveBinary(): string {
  const configured = vscode.workspace
    .getConfiguration("luabox")
    .get<string>("path");
  const path = (configured ?? "").trim();
  return path.length > 0 ? path : "luabox";
}

/** The `luabox` executable could not be found on disk / PATH. */
export class CliMissingError extends Error {
  constructor(public readonly binary: string) {
    super(
      `luabox executable not found (${binary}). Install it — see ` +
        `https://github.com/flying-dice/luabox#install — or set the ` +
        `\`luabox.path\` setting to its full path.`
    );
    this.name = "CliMissingError";
  }
}

/** GitHub rate-limited the CLI; a token would raise the limit. */
export class RateLimitError extends Error {
  constructor(detail: string) {
    super(
      "GitHub rate limit reached. Set a GitHub token in the `luabox.githubToken` " +
        "setting to raise the limit." +
        (detail ? `\n\n${detail}` : "")
    );
    this.name = "RateLimitError";
  }
}

/** A CLI invocation that exited non-zero. Carries stderr for surfacing. */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly code: number
  ) {
    super(message);
    this.name = "CliError";
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Spawn the resolved `luabox` binary with `args` in `cwd`. Injects the GitHub
 * token from the `luabox.githubToken` setting as `LUABOX_GITHUB_TOKEN` in the
 * child env (never logged). Rejects with {@link CliMissingError} when the binary
 * is absent; otherwise resolves with stdout/stderr/exit code (non-zero
 * included — callers decide how to interpret it).
 */
export function runLuabox(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const bin = resolveBinary();
    const token = vscode.workspace
      .getConfiguration("luabox")
      .get<string>("githubToken")
      ?.trim();

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (token) {
      // The CLI honors LUABOX_GITHUB_TOKEN (else GITHUB_TOKEN). We set the
      // luabox-specific one so we never clobber a user's GITHUB_TOKEN.
      env.LUABOX_GITHUB_TOKEN = token;
    }

    execFile(
      bin,
      args,
      { cwd, env, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CliMissingError(bin));
          return;
        }
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0;
        resolve({ stdout, stderr, code });
      }
    );
  });
}

/** Heuristic: does this CLI stderr indicate a GitHub rate-limit / auth issue? */
export function looksRateLimited(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes("rate limit") ||
    s.includes("rate-limit") ||
    s.includes("403") ||
    (s.includes("token") && s.includes("github")) ||
    s.includes("api rate")
  );
}
