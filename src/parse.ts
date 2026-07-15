// Pure, vscode-free parsing of `luabox --format json` output. Kept separate from
// cli.ts (which spawns the binary via vscode config) so it can be unit-tested in
// plain Node against the real CLI's stdout and hand-fed fixtures.

/**
 * A rock returned by `luabox search --format json` (luarocks.org, the
 * registry). `description` is always `null` today — the manifest luabox reads
 * carries no per-rock description (see the CLI's `search_cmd.rs`). `latest` is
 * `null` and `versions` is `0` for a rock with no numeric-versioned release —
 * such a rock cannot be `luabox add`ed.
 */
export interface SearchResult {
  name: string;
  latest: string | null;
  versions: number;
  description: string | null;
}

/** A dependency row from `luabox outdated --format json`. */
export interface Dependency {
  name: string;
  kind: "git" | "path" | "workspace" | "registry" | "url";
  /** `owner/name` for a GitHub git dep, else `null`. */
  repo: string | null;
  /** The git URL for a git dep, else `null`. */
  url: string | null;
  /**
   * The current pin: a git tag/rev/branch, or a registry dep's locked
   * version (its version requirement when unlocked), else `null`.
   */
  current: string | null;
  /**
   * The latest available version: a git+GitHub repo's latest release tag, or
   * a registry rock's highest luarocks.org version, else `null`.
   */
  latest: string | null;
  outdated: boolean;
}

function parseJson<T>(raw: string, what: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`luabox ${what} produced no output`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    throw new Error(`could not parse luabox ${what} output as JSON: ${e}`);
  }
}

/** Parse `luabox search --format json` stdout into a results array. */
export function parseSearch(raw: string): SearchResult[] {
  const parsed = parseJson<{ results?: SearchResult[] }>(raw, "search");
  return parsed.results ?? [];
}

/** Parse `luabox outdated --format json` stdout into a dependencies array. */
export function parseOutdated(raw: string): Dependency[] {
  const parsed = parseJson<{ dependencies?: Dependency[] }>(raw, "outdated");
  return parsed.dependencies ?? [];
}
