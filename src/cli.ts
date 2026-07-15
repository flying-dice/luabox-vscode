import {
  CliError,
  RateLimitError,
  RunResult,
  looksRateLimited,
  runLuabox,
} from "./binary";
import { Dependency, SearchResult, parseOutdated, parseSearch } from "./parse";

export { Dependency, SearchResult } from "./parse";

/**
 * Throw a typed error for a non-zero CLI result. Registry (luarocks.org)
 * operations are anonymous, so their failures are never GitHub rate limits —
 * use this for `search` / `add` / `remove`.
 */
function fail(what: string, r: RunResult): never {
  const detail = r.stderr.trim() || r.stdout.trim() || `exit code ${r.code}`;
  throw new CliError(`luabox ${what} failed: ${detail}`, r.stderr, r.code);
}

/**
 * Throw a typed error for a non-zero CLI result, classifying GitHub rate
 * limits. Only commands that can reach the GitHub API for a `git` dependency
 * (release-tag probing in `outdated`/`update`) need this — everything else is
 * a plain registry op and uses {@link fail}.
 */
function failMaybeRateLimited(what: string, r: RunResult): never {
  if (looksRateLimited(r.stderr) || looksRateLimited(r.stdout)) {
    throw new RateLimitError(r.stderr.trim() || r.stdout.trim());
  }
  fail(what, r);
}

/**
 * `luabox search [query] --format json`. Reads luarocks.org (the registry) —
 * an anonymous read, no GitHub involved. Empty query lists the registry
 * (capped by the CLI). Returns the (possibly empty) results array.
 */
export async function search(
  cwd: string,
  query: string
): Promise<SearchResult[]> {
  const args = ["search"];
  const q = query.trim();
  if (q) {
    args.push(q);
  }
  args.push("--format", "json");
  const r = await runLuabox(args, cwd);
  if (r.code !== 0) {
    fail("search", r);
  }
  return parseSearch(r.stdout);
}

/**
 * `luabox outdated --format json`. Returns every resolved dependency with its
 * kind and current/latest pins and an outdated flag: registry deps compare
 * against luarocks.org (anonymous), git deps compare against their GitHub
 * repo's latest release (may hit the GitHub rate limit).
 */
export async function outdated(cwd: string): Promise<Dependency[]> {
  const r = await runLuabox(["outdated", "--format", "json"], cwd);
  if (r.code !== 0) {
    failMaybeRateLimited("outdated", r);
  }
  return parseOutdated(r.stdout);
}

/**
 * `luabox add <name>[@<versionReq>]` — a bare registry (luarocks.org) add;
 * the CLI edits the project's rockspec and re-syncs. Anonymous, no GitHub
 * involved. Omit `versionReq` to pin `>= <latest>`; pass e.g. `"1.14"` for
 * `>= 1.14` or `"=1.14"` for `== 1.14`.
 */
export async function add(
  cwd: string,
  name: string,
  versionReq?: string
): Promise<void> {
  const spec = versionReq ? `${name}@${versionReq}` : name;
  const r = await runLuabox(["add", spec], cwd);
  if (r.code !== 0) {
    fail("add", r);
  }
}

/** `luabox remove <name>` — drops a registry (rockspec) or path/git/url/workspace
 * (luabox.toml) dependency, wherever it is declared. Anonymous. */
export async function remove(cwd: string, name: string): Promise<void> {
  const r = await runLuabox(["remove", name], cwd);
  if (r.code !== 0) {
    fail("remove", r);
  }
}

/**
 * `luabox update <name>` — for a `git` dep pinned by tag, re-pins to the
 * latest GitHub release tag first (may hit the GitHub rate limit); either
 * way, re-resolves `name` ignoring its lock entry (a registry dep re-resolves
 * to the highest version its rockspec constraint allows).
 */
export async function update(cwd: string, name: string): Promise<void> {
  const r = await runLuabox(["update", name], cwd);
  if (r.code !== 0) {
    failMaybeRateLimited("update", r);
  }
}
