import {
  CliError,
  RateLimitError,
  RunResult,
  looksRateLimited,
  runLuabox,
} from "./binary";
import { Dependency, SearchResult, parseOutdated, parseSearch } from "./parse";

export { Dependency, SearchResult } from "./parse";

/** Throw a typed error for a non-zero CLI result, classifying rate limits. */
function fail(what: string, r: RunResult): never {
  if (looksRateLimited(r.stderr) || looksRateLimited(r.stdout)) {
    throw new RateLimitError(r.stderr.trim() || r.stdout.trim());
  }
  const detail = r.stderr.trim() || r.stdout.trim() || `exit code ${r.code}`;
  throw new CliError(`luabox ${what} failed: ${detail}`, r.stderr, r.code);
}

/**
 * `luabox search [query] --format json`. Empty query returns all `topic:luabox`
 * packages by stars. Returns the (possibly empty) results array.
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
 * `luabox outdated --format json`. Returns every dependency in the manifest
 * with its kind and (for git deps) current/latest pins and an outdated flag.
 */
export async function outdated(cwd: string): Promise<Dependency[]> {
  const r = await runLuabox(["outdated", "--format", "json"], cwd);
  if (r.code !== 0) {
    fail("outdated", r);
  }
  return parseOutdated(r.stdout);
}

/** Install a search result as a git dependency: `luabox add <name> --git <url> --tag <tag>`. */
export async function add(
  cwd: string,
  name: string,
  url: string,
  tag: string | null
): Promise<void> {
  const args = ["add", name, "--git", url];
  if (tag) {
    args.push("--tag", tag);
  }
  const r = await runLuabox(args, cwd);
  if (r.code !== 0) {
    fail("add", r);
  }
}

/** `luabox remove <name>`. */
export async function remove(cwd: string, name: string): Promise<void> {
  const r = await runLuabox(["remove", name], cwd);
  if (r.code !== 0) {
    fail("remove", r);
  }
}

/** `luabox update <name>` — re-pins the dep to the latest release tag. */
export async function update(cwd: string, name: string): Promise<void> {
  const r = await runLuabox(["update", name], cwd);
  if (r.code !== 0) {
    fail("update", r);
  }
}
