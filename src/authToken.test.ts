import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCliToken } from "./authToken";

// Precedence: setting-override (power-user PAT) > native-session token > none.

test("setting override wins over the session token", () => {
  const r = resolveCliToken("pat-abc", "session-xyz");
  assert.deepEqual(r, { token: "pat-abc", source: "setting" });
});

test("setting override wins even with no session", () => {
  const r = resolveCliToken("pat-abc", undefined);
  assert.deepEqual(r, { token: "pat-abc", source: "setting" });
});

test("native session token is used when no setting override", () => {
  const r = resolveCliToken("", "session-xyz");
  assert.deepEqual(r, { token: "session-xyz", source: "session" });
});

test("whitespace-only setting is treated as unset (falls through to session)", () => {
  const r = resolveCliToken("   ", "session-xyz");
  assert.deepEqual(r, { token: "session-xyz", source: "session" });
});

test("no setting and no session => anonymous (none)", () => {
  const r = resolveCliToken(undefined, undefined);
  assert.deepEqual(r, { source: "none" });
});

test("empty setting and empty session => anonymous (none)", () => {
  const r = resolveCliToken("", undefined);
  assert.deepEqual(r, { source: "none" });
});
