import * as vscode from "vscode";
import { DirectoryExplorerController } from "./controller/directoryExplorerController";
import { TerminalService } from "./services/terminalService";
import { WorkspaceCleanup } from "./focus/workspaceCleanup";
import { FocusController } from "./focus/focusController";

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Explorer Pro");
  const cleanup = new WorkspaceCleanup(context);
  context.subscriptions.push(cleanup);
  await cleanup.initialize();
  void cleanup.clean().catch(error => output.appendLine(`[cleanup] ${String(error)}`));
  context.subscriptions.push(vscode.commands.registerCommand("extensionExplorer.cleanupWorkspaces", async () => {
    const removed = await cleanup.clean();
    void vscode.window.showInformationMessage(`Explorer Pro: удалено старых служебных workspace: ${removed}`);
  }));
  const terminals = new TerminalService();
  const focus = await FocusController.create(context, terminals);
  const navigator = new DirectoryExplorerController(context, output, terminals, focus);
  context.subscriptions.push(output, terminals, focus, navigator);
  await navigator.ready;
  return {
    select: (uri: vscode.Uri) => navigator.select(uri),
    currentDirectory: () => navigator.getCurrentDirectory(),
    children: () => navigator.provider.getChildren(),
    focusState: () => focus.getState()
  };
}
