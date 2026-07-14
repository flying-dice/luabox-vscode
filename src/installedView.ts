import * as vscode from "vscode";
import { Dependency, outdated } from "./cli";
import { CliMissingError, RateLimitError } from "./binary";
import { findLuaboxRoot } from "./workspace";

/**
 * Tree node for the "Installed dependencies" view. Either a real dependency, a
 * one-line status message (no manifest / error / empty), or the "N outdated"
 * summary header.
 */
export class DepNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly dep?: Dependency
  ) {
    super(label, collapsibleState);
  }
}

export class InstalledDepsProvider implements vscode.TreeDataProvider<DepNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    DepNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Last known outdated count, mirrored into the view title badge. */
  private outdatedCount = 0;

  constructor(private readonly view: () => vscode.TreeView<DepNode> | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DepNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DepNode): Promise<DepNode[]> {
    if (element) {
      return [];
    }

    const root = await findLuaboxRoot();
    if (!root) {
      const node = new DepNode(
        "No luabox.toml — run `luabox new`",
        vscode.TreeItemCollapsibleState.None
      );
      node.iconPath = new vscode.ThemeIcon("info");
      this.setBadge(0);
      return [node];
    }

    let deps: Dependency[];
    try {
      deps = await outdated(root);
    } catch (e) {
      this.setBadge(0);
      const msg =
        e instanceof CliMissingError
          ? "luabox not found — click for install help"
          : e instanceof RateLimitError
            ? "GitHub rate limited — set luabox.githubToken"
            : `Error: ${(e as Error).message}`;
      const node = new DepNode(msg, vscode.TreeItemCollapsibleState.None);
      node.iconPath = new vscode.ThemeIcon("error");
      node.tooltip = (e as Error).message;
      if (e instanceof CliMissingError) {
        node.command = {
          command: "vscode.open",
          title: "Install luabox",
          arguments: [
            vscode.Uri.parse("https://github.com/flying-dice/luabox#install"),
          ],
        };
      }
      return [node];
    }

    this.outdatedCount = deps.filter((d) => d.outdated).length;
    this.setBadge(this.outdatedCount);

    if (deps.length === 0) {
      const node = new DepNode(
        "No dependencies yet — search and install one",
        vscode.TreeItemCollapsibleState.None
      );
      node.iconPath = new vscode.ThemeIcon("package");
      return [node];
    }

    return deps.map((d) => this.toNode(d));
  }

  private toNode(d: Dependency): DepNode {
    const node = new DepNode(d.name, vscode.TreeItemCollapsibleState.None, d);

    if (d.kind === "git" && d.outdated && d.current && d.latest) {
      // e.g. "v0.1.0 → v0.1.3"
      node.description = `${d.current} → ${d.latest}`;
      node.iconPath = new vscode.ThemeIcon(
        "arrow-circle-up",
        new vscode.ThemeColor("charts.yellow")
      );
      node.contextValue = "gitOutdated";
      node.tooltip = new vscode.MarkdownString(
        `**${d.name}** (git)\n\n` +
          `Current: \`${d.current}\`\n\nLatest: \`${d.latest}\`\n\n` +
          `Repo: ${d.repo ?? d.url ?? "?"}`
      );
    } else if (d.kind === "git") {
      node.description = d.current ?? "git";
      node.iconPath = new vscode.ThemeIcon("check");
      node.contextValue = "gitCurrent";
      node.tooltip = new vscode.MarkdownString(
        `**${d.name}** (git) — up to date${
          d.current ? ` at \`${d.current}\`` : ""
        }`
      );
    } else {
      // path / workspace / registry — no meaningful git "outdated"; read-only-ish.
      node.description = d.current ? `${d.kind} ${d.current}` : d.kind;
      node.iconPath = new vscode.ThemeIcon("symbol-file");
      node.contextValue = "depOther";
      node.tooltip = `${d.name} (${d.kind})`;
    }
    return node;
  }

  private setBadge(count: number): void {
    const v = this.view();
    if (!v) {
      return;
    }
    v.badge =
      count > 0
        ? {
            value: count,
            tooltip: `${count} outdated ${count === 1 ? "dependency" : "dependencies"}`,
          }
        : undefined;
  }
}
