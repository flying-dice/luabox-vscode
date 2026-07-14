# luabox for VS Code

First-class VS Code support for the
[luabox](https://github.com/flying-dice/luabox) Lua
toolchain. This extension is a thin wrapper around the `luabox lsp`
language server: typecheck + lint diagnostics with quick-fixes, hover,
completion (incl. auto-require imports), goto definition/type-definition/
implementation, find-references, rename, symbols, signature help, call
hierarchy, inlay hints, formatting and semantic highlighting for `.lua`
sources.

## What it provides

- Launches `luabox lsp` (stdio) via `vscode-languageclient` and attaches it to
  `lua` documents.
- **Formatting** (`Format Document`, and `Format Selection` with
  whole-document MVP semantics) via the canonical luabox formatters — see
  [Formatting](#formatting) below.
- **Semantic highlighting**: the server advertises semantic tokens with only
  standard token types/modifiers, and `vscode-languageclient` requests them
  automatically — no theme configuration needed. Locals vs globals,
  parameters and LuaCATS `---@` annotation comments all render distinctly.
- A `luabox.path` setting to point at a specific `luabox` binary.
- A `luabox: Restart Language Server` command (`luabox.restartServer`).

> The extension attaches to `.lua` files **without** declaring the `lua`
> language itself, so it never conflicts with the grammar shipped by other Lua
> extensions (e.g. sumneko/LuaLS). Install a Lua grammar extension alongside it
> for `.lua` syntax highlighting.

## Dependency management

A dedicated **luabox** container in the Activity Bar gives `luabox.toml`
projects an npm-registry-style dependency GUI. Everything it does is call the
`luabox` CLI (the same binary the language server uses, resolved via
`luabox.path`) in your workspace folder and render the result — the CLI owns all
GitHub and TOML logic.

- **Packages** (webview): a search box and result cards. Each card shows the
  package name and `owner/repo`, ★ stars, description, topics, and the latest
  release tag, with a one-click **Install**. An empty query lists all public
  GitHub repos tagged `luabox`. Install runs
  `luabox add <name> --git <url> --tag <latest>`.
  > luabox packages are public GitHub repos with the `luabox` topic and a root
  > `luabox.toml`. None are published yet, so search legitimately returns no
  > results today — the panel says so rather than looking broken.
- **Installed dependencies** (tree): every dependency in `luabox.toml` with its
  current pin. A git dependency that is behind its repo's latest GitHub release
  shows a `current → latest` badge and an **Update** button
  (`luabox update <name>`, re-pinning to the latest tag); every dependency has a
  **Remove** button (`luabox remove <name>`). Path / workspace / registry
  dependencies are shown read-only (no false "outdated"). The view title carries
  a badge with the number of outdated dependencies and a **Refresh** action, and
  it auto-refreshes whenever `luabox.toml` is saved or a dependency is
  installed / updated / removed.

If the workspace has no `luabox.toml`, the panel shows a friendly prompt to run
`luabox new` instead of any actions. If the `luabox` binary can't be found, the
panel links to the [install docs](https://github.com/flying-dice/luabox#install).

### Authentication

Package search and outdated checks hit the GitHub API, which rate-limits
unauthenticated calls. **The extension uses your VS Code GitHub sign-in
automatically** — the account behind the **Accounts** menu (the person icon at
the bottom of the Activity Bar). No token to paste, no device flow: if you are
signed in to GitHub in VS Code, the extension reuses that session (requesting no
scopes — an authenticated token alone lifts the rate limit and reads public
data) and passes it to the `luabox` CLI as the `LUABOX_GITHUB_TOKEN` environment
variable. The token is only held in memory and passed to the child process; it
is never logged or written to disk by the extension (VS Code's SecretStorage
backs the session).

- The **Packages** panel shows **Signed in as `<user>`** when a session exists,
  or a **Sign in to GitHub** button otherwise. There are also
  **luabox: Sign in to GitHub** / **luabox: Sign out of GitHub** commands.
- If you hit a rate limit while signed out, the extension offers an actionable
  **Sign in to GitHub** prompt.
- **Signing out** is done through VS Code itself: the editor owns the GitHub
  session, so use **Accounts ▸ your GitHub account ▸ Sign Out**. The extension's
  "Sign out" command points you there rather than faking a sign-out it cannot
  actually perform.

**Optional PAT override.** For setups the native sign-in can't cover (GitHub
Enterprise, restricted orgs, or a CI-style token), set **`luabox.githubToken`**
to a read-only Personal Access Token (a classic token with `public_repo` scope,
or a fine-grained token with public read access). When set, it takes precedence
over the native session and is passed as `LUABOX_GITHUB_TOKEN`. Leaving it empty
is the normal path — the native session (or, failing that, the CLI's own
`LUABOX_GITHUB_TOKEN` / `GITHUB_TOKEN` environment resolution) is used.

## Requirements

- A `luabox` binary on your `PATH` (or configured via `luabox.path`). The
  normal way to get one is the install script — see [Getting the `luabox`
  binary](#getting-the-luabox-binary) below. Building from source
  (`cargo build --release`) is only needed if you're developing luabox
  itself.
- VS Code `^1.85.0`.

## Getting the `luabox` binary

From a released build, run the install script for your platform (releases are
cut in the [luabox toolchain repo](https://github.com/flying-dice/luabox)):

```sh
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/flying-dice/luabox/main/scripts/install.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/flying-dice/luabox/main/scripts/install.ps1 | iex
```

Both scripts fetch the latest tagged GitHub Release's binary asset, verify it
against the release's `SHA256SUMS`, and install it to `~/.luabox/bin`
(Linux/macOS) or `%USERPROFILE%\.luabox\bin` (Windows) by default — override
with `LUABOX_INSTALL_DIR`, or pin a release with `LUABOX_VERSION=vX.Y.Z`.

Then install this extension itself — see [Installing the extension](#installing-the-extension).

## Installing the extension

The extension has two pieces, versioned and released independently:

1. **The `luabox` binary** — the language server the extension wraps. It ships
   from the [luabox toolchain repo](https://github.com/flying-dice/luabox);
   grab it with the install one-liners under
   [Getting the `luabox` binary](#getting-the-luabox-binary) above (see also
   the toolchain's [install docs](https://github.com/flying-dice/luabox#install)).
2. **This extension (`.vsix`)** — released here, on its own version line (its
   `package.json` version, independent of the CLI's tags).

To install the extension:

- **From a release (recommended)**: download the latest `luabox-<version>.vsix`
  from this repo's
  [GitHub Releases](https://github.com/flying-dice/luabox-vscode/releases),
  then:

  ```sh
  code --install-extension luabox-<version>.vsix
  ```

  or use **Extensions ▸ … ▸ Install from VSIX** in the UI. Every release also
  attaches a `SHA256SUMS` you can verify the download against.
- **Build one yourself**: see [Package a `.vsix`](#package-a-vsix).
- **From the Marketplace / Open VSX**: not yet published — see
  [Publishing to the Marketplace](#publishing-to-the-marketplace) for the
  residual manual steps. The `.vsix` from these releases is what gets
  drag-and-dropped into the Marketplace.

## Formatting

The server provides document (and range) formatting for `.lua`: it is
formatted in the canonical luabox style for the project's edition (SPEC §10).
The formatter never destroys code — a document with parse errors is simply
left unchanged. Range formatting has MVP semantics: the whole document is
formatted (the canonical formatter is whole-file by design).

For `.lua` files other Lua extensions may also register formatters, so pick
luabox explicitly if you want it:

```jsonc
"[lua]": {
  "editor.defaultFormatter": "luabox.luabox",
  "editor.formatOnSave": true
},
```

(`luabox.luabox` is this extension's ID: `publisher.name`.)

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `luabox.path` | `luabox` | Path to the `luabox` executable. A bare name is resolved on `PATH`. The server is launched as `<path> lsp`. |
| `luabox.githubToken` | `""` | **Advanced override.** Normally unnecessary — the extension uses your VS Code GitHub sign-in automatically. Set a Personal Access Token here only for GitHub Enterprise / restricted orgs; when set it takes precedence over the native session and is passed to the CLI as `LUABOX_GITHUB_TOKEN` (never logged). |
| `luabox.trace.server` | `off` | Trace LSP traffic (`off` / `messages` / `verbose`). |

## For maintainers: building and packaging

The rest of this section is for people building the extension itself, not
end users (who should follow [Getting the `luabox` binary](#getting-the-luabox-binary)
and [Installing the extension](#installing-the-extension) above).

### Build from source

```sh
git clone https://github.com/flying-dice/luabox-vscode
cd luabox-vscode
npm ci                    # or: npm install
npm run compile          # tsc -> ./out/extension.js
```

### Run in the Extension Development Host

Open this repo in VS Code and press <kbd>F5</kbd> (Run Extension). A new
window opens with the extension loaded; open a `.lua` file to activate
the server.

### Package a `.vsix`

```sh
npm install -g @vscode/vsce      # or use: npx @vscode/vsce
npx @vscode/vsce package
```

This produces `luabox-0.2.1.vsix`, which can be installed via
`code --install-extension luabox-0.2.1.vsix` or **Extensions ▸ … ▸ Install from
VSIX** in the UI.

## Publishing to the Marketplace

Publishing requires credentials that are **not** bundled here:

1. Create a publisher named `luabox` at
   <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps Personal Access Token with the **Marketplace ▸
   Manage** scope.
3. `npx @vscode/vsce login luabox` (paste the PAT), then
   `npx @vscode/vsce publish`.

For Open VSX (used by VSCodium / Cursor / Gitpod), use `npx ovsx publish` with
an Open VSX token instead.

## Changelog

Releases are tagged in this repo and published to
[GitHub Releases](https://github.com/flying-dice/luabox-vscode/releases), each
with the packaged `.vsix` and its `SHA256SUMS`. The extension is versioned
independently of the `luabox` toolchain.

### 0.2.1

- **Native GitHub authentication**: the dependency-management features now use
  VS Code's built-in GitHub sign-in (the **Accounts** menu) automatically —
  no pasted token, no device flow. The session token (requested with no scopes,
  which is enough to lift the API rate limit) is injected into the `luabox` CLI
  as `LUABOX_GITHUB_TOKEN` and never logged or persisted by the extension. The
  **Packages** panel shows **Signed in as `<user>`** or a **Sign in to GitHub**
  affordance; new **luabox: Sign in / Sign out of GitHub** commands and a
  rate-limit sign-in nudge round it out. Sign-out honestly directs to the
  Accounts menu (VS Code owns the session).
- **`luabox.githubToken` is now an optional power-user override** (retained for
  GitHub Enterprise / restricted orgs). When set it takes precedence over the
  native session; otherwise the native session is used.

### 0.2.0

- **Dependency management GUI**: a new **luabox** Activity Bar container with a
  **Packages** search webview (npm-style result cards with ★ stars, description,
  latest tag, and one-click Install) and an **Installed dependencies** tree
  (current pins, `current → latest` outdated badges, per-dep Update / Remove, an
  outdated-count badge, Refresh, and auto-refresh on `luabox.toml` save). All
  actions shell out to the `luabox` CLI (`search` / `outdated` / `add` /
  `update` / `remove`) in the workspace and render its JSON.
- New **`luabox.githubToken`** setting, passed to the CLI as
  `LUABOX_GITHUB_TOKEN` to raise the GitHub API rate limit for search / outdated.
  Rate-limit and "binary not found" errors are surfaced inline with actionable
  buttons.

### 0.1.0

- Initial standalone release: VS Code client for the `luabox lsp` language
  server — diagnostics, hover, completion, goto, references, rename, symbols,
  signature help, inlay hints, formatting, semantic highlighting, and a
  server-state status bar item with a restart command.

## Notes / known deviations

- The language server is launched as `luabox lsp` (no `--stdio` flag): the
  current CLI serves LSP over stdio unconditionally and rejects extra
  arguments. If a `--stdio` flag is added later, update `args` in
  `src/extension.ts`.
