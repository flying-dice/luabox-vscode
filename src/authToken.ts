// Pure, vscode-free token-precedence logic for the GitHub auth flow. Kept
// separate from auth.ts (which imports vscode for the session API) so the
// precedence rule can be unit-tested in plain Node — mirrors parse.ts.

/** Source of the token handed to the CLI, for precedence + diagnostics. */
export type TokenSource = "setting" | "session" | "none";

/**
 * Pure precedence: which token the CLI should use given the advanced
 * `luabox.githubToken` PAT-override setting and a native session token.
 *
 * Order: the explicit setting override (power-user PAT, for GHE / restricted
 * orgs) wins if set; else the native session token; else none (anonymous).
 */
export function resolveCliToken(
  settingToken: string | undefined,
  sessionToken: string | undefined
): { token?: string; source: TokenSource } {
  const s = settingToken?.trim();
  if (s) {
    return { token: s, source: "setting" };
  }
  if (sessionToken) {
    return { token: sessionToken, source: "session" };
  }
  return { source: "none" };
}
