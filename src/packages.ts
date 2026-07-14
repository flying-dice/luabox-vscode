import * as vscode from "vscode";
import { CliMissingError, RateLimitError } from "./binary";
import { getGithubToken, onGithubAuthChange } from "./auth";
import * as cli from "./cli";
import { DepNode, InstalledDepsProvider } from "./installedView";
import { PackagesViewProvider } from "./packagesView";
import { findLuaboxRoot } from "./workspace";

/** Surface a CLI error as a modal-free notification, classifying known cases. */
function reportError(prefix: string, e: unknown): void {
  if (e instanceof CliMissingError) {
    void vscode.window
      .showErrorMessage(e.message, "Install luabox")
      .then((pick) => {
        if (pick) {
          void vscode.env.openExternal(
            vscode.Uri.parse("https://github.com/flying-dice/luabox#install")
          );
        }
      });
    return;
  }
  if (e instanceof RateLimitError) {
    // Actionable nudge: if there is no native session, offer sign-in (raises the
    // rate limit); if already signed in, a PAT override is the remaining lever.
    void (async () => {
      const session = await getGithubToken(false);
      if (!session) {
        const pick = await vscode.window.showWarningMessage(
          e.message,
          "Sign in to GitHub"
        );
        if (pick) {
          void vscode.commands.executeCommand("luabox.signInGithub");
        }
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        `${e.message}\n\nYou are signed in as ${session.label}; a PAT override ` +
          "with higher limits can be set in luabox.githubToken.",
        "Open Settings"
      );
      if (pick) {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "luabox.githubToken"
        );
      }
    })();
    return;
  }
  void vscode.window.showErrorMessage(`${prefix}: ${(e as Error).message}`);
}

/**
 * Wire the dependency-management GUI: the search webview, the installed-deps
 * tree, the install/update/remove/refresh/search commands, and a watcher that
 * auto-refreshes when luabox.toml is saved.
 */
export function registerPackages(context: vscode.ExtensionContext): void {
  let installedView: vscode.TreeView<DepNode> | undefined;
  const installed = new InstalledDepsProvider(() => installedView);
  installedView = vscode.window.createTreeView("luabox.installed", {
    treeDataProvider: installed,
  });
  context.subscriptions.push(installedView);

  const packagesProvider = new PackagesViewProvider(
    context.extensionUri,
    () => installed.refresh()
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PackagesViewProvider.viewId,
      packagesProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  /**
   * Run a mutating CLI action against the manifest root, then refresh. Returns
   * true only if the action ran and did not throw.
   */
  async function withRoot(
    label: string,
    action: (root: string) => Promise<void>
  ): Promise<boolean> {
    const root = await findLuaboxRoot();
    if (!root) {
      void vscode.window.showWarningMessage(
        "No luabox.toml in this workspace. Run `luabox new` to create a project first."
      );
      return false;
    }
    try {
      await vscode.window.withProgress(
        { location: { viewId: "luabox.installed" }, title: label },
        () => action(root)
      );
      return true;
    } catch (e) {
      reportError(label, e);
      return false;
    } finally {
      installed.refresh();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "luabox.packages.install",
      async (arg: { name: string; url: string; tag: string | null }) => {
        return withRoot(`Installing ${arg.name}`, async (root) => {
          await cli.add(root, arg.name, arg.url, arg.tag);
          void vscode.window.showInformationMessage(
            `Installed ${arg.name}${arg.tag ? ` (${arg.tag})` : ""}.`
          );
        });
      }
    ),
    vscode.commands.registerCommand(
      "luabox.packages.update",
      async (node?: DepNode) => {
        const name = node?.dep?.name;
        if (!name) {
          return;
        }
        await withRoot(`Updating ${name}`, async (root) => {
          await cli.update(root, name);
          void vscode.window.showInformationMessage(`Updated ${name}.`);
        });
      }
    ),
    vscode.commands.registerCommand(
      "luabox.packages.remove",
      async (node?: DepNode) => {
        const name = node?.dep?.name;
        if (!name) {
          return;
        }
        const pick = await vscode.window.showWarningMessage(
          `Remove dependency "${name}" from luabox.toml?`,
          { modal: true },
          "Remove"
        );
        if (pick !== "Remove") {
          return;
        }
        await withRoot(`Removing ${name}`, async (root) => {
          await cli.remove(root, name);
          void vscode.window.showInformationMessage(`Removed ${name}.`);
        });
      }
    ),
    vscode.commands.registerCommand("luabox.packages.refresh", () => {
      installed.refresh();
    }),
    vscode.commands.registerCommand("luabox.packages.search", () => {
      packagesProvider.focusSearch();
    }),
    vscode.commands.registerCommand("luabox.signInGithub", async () => {
      // Drives VS Code's native GitHub sign-in. onDidChangeSessions then
      // refreshes the panels, but refresh eagerly too for immediate feedback.
      const auth = await getGithubToken(true);
      if (auth) {
        void vscode.window.showInformationMessage(
          `Signed in to GitHub as ${auth.label}.`
        );
        void packagesProvider.refreshAuth();
        installed.refresh();
      }
      // Undefined => the user declined the sign-in dialog; stay anonymous.
    }),
    vscode.commands.registerCommand("luabox.signOutGithub", () => {
      // VS Code owns the GitHub session lifecycle; another provider's session
      // cannot be revoked programmatically. Be honest: direct the user to the
      // Accounts menu rather than faking a sign-out.
      void vscode.window.showInformationMessage(
        "GitHub sign-in is managed by VS Code. To sign out, open the Accounts " +
          "menu (the person icon at the bottom of the Activity Bar), select " +
          "your GitHub account, and choose Sign Out."
      );
    })
  );

  // Refresh auth status + panels whenever the user signs in / out via the
  // Accounts menu.
  context.subscriptions.push(
    onGithubAuthChange(() => {
      void packagesProvider.refreshAuth();
      installed.refresh();
    })
  );

  // Auto-refresh the installed view whenever a luabox.toml is saved (install /
  // remove / update / hand edits all flow through here).
  const watcher = vscode.workspace.createFileSystemWatcher("**/luabox.toml");
  const bump = () => installed.refresh();
  watcher.onDidChange(bump);
  watcher.onDidCreate(bump);
  watcher.onDidDelete(bump);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith("luabox.toml")) {
        installed.refresh();
      }
    })
  );
}
