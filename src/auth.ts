import * as vscode from "vscode";
import { TokenSource, resolveCliToken } from "./authToken";

export { TokenSource, resolveCliToken } from "./authToken";

/**
 * Native GitHub authentication for the dependency-management features.
 *
 * The extension reuses VS Code's built-in `github` authentication provider (the
 * one behind the Accounts menu) instead of asking the user to paste a Personal
 * Access Token. The session's access token is injected into the `luabox` CLI's
 * environment as `LUABOX_GITHUB_TOKEN` so `search` / `outdated` / `add` /
 * `update` / `remove` run authenticated (which lifts the GitHub API rate limit).
 *
 * The token is only ever held in memory and passed via child-process env — it is
 * never logged or written to disk by us. VS Code's SecretStorage backs the
 * session itself.
 */

/**
 * Scopes requested from the `github` provider. Deliberately EMPTY: an
 * authenticated GitHub token, even with no scopes, lifts the API rate limit and
 * reads public data — which is all the CLI's search / outdated need. Least
 * privilege. (If an empty-scope session ever fails to return a usable token in
 * practice, fall back to `["read:user"]`.)
 */
export const GITHUB_SCOPES: readonly string[] = [];

/** A resolved GitHub identity: the access token plus the account label. */
export interface GithubAuth {
  /** The session access token — inject into env, never log. */
  token: string;
  /** The signed-in account label (e.g. the GitHub username) — safe to show. */
  label: string;
}

/** The outcome of resolving which token (if any) the CLI should use. */
export interface ResolvedToken {
  /** The token to inject, or undefined to run anonymous. */
  token?: string;
  source: TokenSource;
  /** Account label when {@link source} is `"session"`; undefined otherwise. */
  label?: string;
}

let output: vscode.OutputChannel | undefined;

/** Lazily-created output channel for auth diagnostics (never logs the token). */
function channel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel("luabox");
  }
  return output;
}

/**
 * Resolve a native VS Code GitHub session.
 *
 * @param createIfNone when true, drives VS Code's interactive sign-in flow;
 *   when false, does a silent check (no UI) and returns undefined if there is no
 *   existing session.
 * @returns the token + account label, or undefined when there is no session
 *   (silent) or the user declined / the provider is unavailable.
 */
export async function getGithubToken(
  createIfNone: boolean
): Promise<GithubAuth | undefined> {
  try {
    const session = await vscode.authentication.getSession(
      "github",
      GITHUB_SCOPES as string[],
      { createIfNone, silent: !createIfNone }
    );
    if (!session) {
      return undefined;
    }
    return { token: session.accessToken, label: session.account.label };
  } catch {
    // User declined the sign-in prompt, or the `github` provider is
    // unavailable (e.g. no network). Treat as "not signed in".
    return undefined;
  }
}

/**
 * Resolve the token to hand the `luabox` CLI for this invocation, applying the
 * setting-override > native-session > none precedence. Never prompts: the
 * native session is fetched silently (`createIfNone: false`), so background CLI
 * calls never pop a sign-in dialog.
 */
export async function resolveGithubTokenForCli(): Promise<ResolvedToken> {
  const settingToken = vscode.workspace
    .getConfiguration("luabox")
    .get<string>("githubToken");

  // Only pay for a silent session lookup when there is no PAT override.
  let session: GithubAuth | undefined;
  if (!settingToken?.trim()) {
    session = await getGithubToken(false);
  }

  const picked = resolveCliToken(settingToken, session?.token);
  return {
    token: picked.token,
    source: picked.source,
    label: picked.source === "session" ? session?.label : undefined,
  };
}

/** Log (only) the resolved token source + label — never the token itself. */
export function traceResolvedToken(resolved: ResolvedToken): void {
  switch (resolved.source) {
    case "session":
      channel().appendLine(
        `[auth] using native GitHub session token for ${resolved.label}`
      );
      break;
    case "setting":
      channel().appendLine(
        "[auth] using luabox.githubToken PAT override for CLI auth"
      );
      break;
    case "none":
      // Anonymous — say so once per call so rate-limit surprises are explicable.
      channel().appendLine("[auth] no GitHub token; running CLI anonymously");
      break;
  }
}

/**
 * Subscribe to GitHub sign-in / sign-out via the Accounts menu. Fires `onChange`
 * whenever the `github` provider's sessions change so panels can refresh their
 * auth state. Returns a Disposable to register in the extension subscriptions.
 */
export function onGithubAuthChange(onChange: () => void): vscode.Disposable {
  return vscode.authentication.onDidChangeSessions((e) => {
    if (e.provider.id === "github") {
      onChange();
    }
  });
}
