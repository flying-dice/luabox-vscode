import * as vscode from "vscode";

/** Filesystem path of the first workspace folder containing a root `luabox.toml`. */
export async function findLuaboxRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const manifest = vscode.Uri.joinPath(folder.uri, "luabox.toml");
    try {
      await vscode.workspace.fs.stat(manifest);
      return folder.uri.fsPath;
    } catch {
      // no luabox.toml in this folder; keep looking
    }
  }
  return undefined;
}
