import * as vscode from "vscode";
import { DirectoryExplorerController } from "./controller/directoryExplorerController";
import { TerminalService } from "./services/terminalService";
import { FocusController } from "./focus/focusController";

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Explorer Pro");
  const terminals = new TerminalService();
  const focus = await FocusController.create(context, terminals);
  const navigator = new DirectoryExplorerController(context, output, terminals, focus);
  context.subscriptions.push(output, terminals, focus, navigator);
  await navigator.ready;
  return {
    currentDirectory: () => navigator.getCurrentDirectory(),
    children: () => navigator.provider.getChildren(),
    focusState: () => focus.getState()
  };
}
