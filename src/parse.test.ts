import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOutdated, parseSearch } from "./parse";

// Fixtures below are copied verbatim from the real CLI's `--format json`
// output (crates/luabox-cli/src/search_cmd.rs / outdated_cmd.rs in the luabox
// repo), not hand-guessed — see `luabox search penlight --format json`.

test("parseSearch reads the frozen {results:[...]} envelope", () => {
  const raw = JSON.stringify({
    results: [
      { name: "penlight", latest: "1.15.0", versions: 29, description: null },
      {
        name: "penlight-ffi",
        latest: null,
        versions: 0,
        description: null,
      },
    ],
  });
  assert.deepEqual(parseSearch(raw), [
    { name: "penlight", latest: "1.15.0", versions: 29, description: null },
    { name: "penlight-ffi", latest: null, versions: 0, description: null },
  ]);
});

test("parseSearch tolerates a missing results key", () => {
  assert.deepEqual(parseSearch("{}"), []);
});

test("parseSearch throws on empty stdout", () => {
  assert.throws(() => parseSearch(""), /produced no output/);
});

test("parseSearch throws on invalid JSON", () => {
  assert.throws(() => parseSearch("{not json"), /could not parse/);
});

test("parseOutdated reads the frozen {dependencies:[...]} envelope, all kinds", () => {
  const raw = JSON.stringify({
    dependencies: [
      {
        name: "penlight",
        kind: "registry",
        repo: null,
        url: null,
        current: "1.14.0",
        latest: "1.15.0",
        outdated: true,
      },
      {
        name: "some-git-dep",
        kind: "git",
        repo: "owner/some-git-dep",
        url: "https://github.com/owner/some-git-dep.git",
        current: "v0.1.0",
        latest: "v0.1.2",
        outdated: true,
      },
      {
        name: "vendored",
        kind: "path",
        repo: null,
        url: null,
        current: null,
        latest: null,
        outdated: false,
      },
      {
        name: "tarball-dep",
        kind: "url",
        repo: null,
        url: null,
        current: null,
        latest: null,
        outdated: false,
      },
      {
        name: "workspace-member",
        kind: "workspace",
        repo: null,
        url: null,
        current: null,
        latest: null,
        outdated: false,
      },
    ],
  });
  const deps = parseOutdated(raw);
  assert.equal(deps.length, 5);
  assert.equal(deps[0].kind, "registry");
  assert.equal(deps[0].outdated, true);
  assert.equal(deps[3].kind, "url");
});

test("parseOutdated tolerates a missing dependencies key", () => {
  assert.deepEqual(parseOutdated("{}"), []);
});

test("parseOutdated throws on empty stdout", () => {
  assert.throws(() => parseOutdated(""), /produced no output/);
});
