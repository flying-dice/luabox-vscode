import * as vscode from "vscode";
import { search } from "./cli";
import { findLuaboxRoot } from "./workspace";

function nonce(): string {
  let t = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    t += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return t;
}

type InMessage =
  | { type: "search"; query: string }
  | { type: "install"; name: string; version: string | null }
  | { type: "ready" };

/**
 * WebviewViewProvider for the "Packages" panel: an npm-registry-style search box
 * over luarocks.org (the registry) with result cards (name, latest version,
 * version count, description, Install). Registry search/install is anonymous —
 * this view never gates on or nudges GitHub sign-in (that only matters for
 * git-source dependencies, handled elsewhere). All CLI work is done by the
 * CLI; this view only spawns it and renders.
 */
export class PackagesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "luabox.packages";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    /** Invoked after a successful install so the installed view can refresh. */
    private readonly onInstalled: () => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: InMessage) => {
      switch (msg.type) {
        case "ready":
          void this.runSearch("");
          break;
        case "search":
          void this.runSearch(msg.query);
          break;
        case "install":
          void this.runInstall(msg.name, msg.version);
          break;
      }
    });
  }

  /** Reveal the view and focus its search box. */
  focusSearch(): void {
    this.view?.show?.(true);
    void this.post({ type: "focusSearch" });
  }

  private post(message: unknown): Thenable<boolean> {
    return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
  }

  private async runSearch(query: string): Promise<void> {
    const root = await findLuaboxRoot();
    if (!root) {
      await this.post({ type: "noManifest" });
      return;
    }
    await this.post({ type: "loading" });
    try {
      const results = await search(root, query);
      await this.post({ type: "results", results, query });
    } catch (e) {
      await this.post({ type: "error", message: this.errorText(e) });
    }
  }

  private async runInstall(
    name: string,
    version: string | null
  ): Promise<void> {
    // Route through the shared command so install/update/remove share one path.
    const ok = await vscode.commands.executeCommand<boolean>(
      "luabox.packages.install",
      { name, version }
    );
    // Reflect the real outcome on the card (the command reports errors itself).
    await this.post({ type: ok ? "installed" : "installFailed", name });
    this.onInstalled();
  }

  private errorText(e: unknown): string {
    return (e as Error).message ?? String(e);
  }

  private html(webview: vscode.Webview): string {
    const n = nonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${n}'`,
    ].join("; ");

    // Self-contained: all CSS/JS inline, theme via VS Code CSS variables.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 8px 10px 16px;
  }
  .searchbar { display: flex; gap: 6px; position: sticky; top: 0;
    background: var(--vscode-sideBar-background); padding-bottom: 8px; z-index: 2; }
  #q {
    flex: 1; box-sizing: border-box;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 5px 8px; border-radius: 2px; outline: none;
  }
  #q:focus { border-color: var(--vscode-focusBorder); }
  button {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none; padding: 5px 10px; border-radius: 2px; cursor: pointer;
    font-family: inherit; font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .55; cursor: default; }
  .status { padding: 10px 2px; color: var(--vscode-descriptionForeground); }
  .status.error {
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    border-radius: 3px; padding: 8px 10px; white-space: pre-wrap;
  }
  .spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px;
    border: 2px solid var(--vscode-descriptionForeground); border-top-color: transparent;
    border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, #8884));
    border-radius: 4px; padding: 10px 12px; margin: 8px 0;
    background: var(--vscode-editorWidget-background, transparent);
  }
  .card .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .card .name { font-weight: 600; }
  .card .desc { margin: 6px 0; color: var(--vscode-foreground); }
  .card .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .card .ver { color: var(--vscode-descriptionForeground); font-size: .92em; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="searchbar">
    <input id="q" type="text" placeholder="Search luarocks.org…" autocomplete="off" spellcheck="false" />
    <button id="go">Search</button>
  </div>
  <div id="out"><div class="status">Loading packages…</div></div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const q = document.getElementById("q");
  const out = document.getElementById("out");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function doSearch() { vscode.postMessage({ type: "search", query: q.value }); }
  document.getElementById("go").addEventListener("click", doSearch);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

  function render(results, query) {
    if (!results.length) {
      out.innerHTML =
        '<div class="status">No rocks found' +
        (query ? ' for "' + esc(query) + '"' : '') +
        ' on luarocks.org.</div>';
      return;
    }
    out.innerHTML = results.map(function (r, i) {
      const installable = r.latest && r.versions > 0;
      const ver = r.latest
        ? esc(r.latest) + ' · ' + r.versions + (r.versions === 1 ? ' version' : ' versions')
        : 'no installable release';
      return '<div class="card" data-i="' + i + '">' +
        '<div class="top">' +
          '<span class="name">' + esc(r.name) + '</span>' +
        '</div>' +
        (r.description ? '<div class="desc">' + esc(r.description) + '</div>' : '') +
        '<div class="meta">' +
          '<span class="ver">' + ver + '</span>' +
          '<button class="install" data-i="' + i + '"' + (installable ? '' : ' disabled title="no installable version"') + '>Install</button>' +
        '</div>' +
      '</div>';
    }).join("");

    out.querySelectorAll("button.install").forEach(function (b) {
      b.addEventListener("click", function () {
        const r = results[Number(b.getAttribute("data-i"))];
        b.disabled = true; b.textContent = "Installing…";
        vscode.postMessage({ type: "install", name: r.name, version: r.latest });
      });
    });
  }

  window.addEventListener("message", function (ev) {
    const m = ev.data;
    switch (m.type) {
      case "loading":
        out.innerHTML = '<div class="status"><span class="spinner"></span>Searching…</div>';
        break;
      case "results":
        render(m.results, m.query);
        break;
      case "error":
        out.innerHTML = '<div class="status error">' + esc(m.message) + '</div>';
        break;
      case "noManifest":
        out.innerHTML = '<div class="status">No <code>luabox.toml</code> in this workspace. Run <code>luabox new</code> (or <code>luabox init</code>) to create a project, then search for packages to add.</div>';
        break;
      case "installed": {
        out.querySelectorAll(".install").forEach(function (b) {
          if (b.textContent === "Installing…") { b.textContent = "Installed ✓"; }
        });
        break;
      }
      case "installFailed": {
        out.querySelectorAll(".install").forEach(function (b) {
          if (b.textContent === "Installing…") { b.disabled = false; b.textContent = "Install"; }
        });
        break;
      }
      case "focusSearch":
        q.focus(); q.select();
        break;
    }
  });

  // Ask the host for the initial (empty-query) listing.
  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
  }
}
