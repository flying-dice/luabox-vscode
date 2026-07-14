// Pure, vscode-free parsing of `luabox --format json` output. Kept separate from
// cli.ts (which spawns the binary via vscode config) so it can be unit-tested in
// plain Node against the real CLI's stdout and hand-fed fixtures.

/** A package returned by `luabox search --format json`. */
export interface SearchResult {
  name: string;
  repo: string;
  url: string;
  description: string | null;
  stars: number;
  latest: string | null;
  topics: string[];
}

/** A dependency row from `luabox outdated --format json`. */
export interface Dependency {
  name: string;
  kind: "git" | "path" | "workspace" | "registry";
  repo: string | null;
  url: string | null;
  current: string | null;
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
