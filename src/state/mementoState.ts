import * as vscode from "vscode";

export function getStateMemento(
  context: vscode.ExtensionContext
): vscode.Memento {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? context.workspaceState
    : context.globalState;
}
