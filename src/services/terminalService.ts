import * as vscode from "vscode";
import * as path from "path";

export class TerminalService implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly listener = vscode.window.onDidCloseTerminal(terminal => {
    for (const [key, value] of this.terminals) if (value === terminal) this.terminals.delete(key);
  });

  public constructor() {
    // Extension hosts restart on workspace changes while user terminals can survive.
    for (const terminal of vscode.window.terminals) {
      const options = terminal.creationOptions;
      if (!terminal.name.startsWith("Explorer Pro:") || !("cwd" in options) || !options.cwd) continue;
      const uri = typeof options.cwd === "string" ? vscode.Uri.file(options.cwd) : options.cwd;
      this.terminals.set(uri.toString(), terminal);
    }
  }

  public open(dir: vscode.Uri): void {
    if (!vscode.workspace.isTrusted) throw new Error("Trust the workspace before opening a terminal.");
    const key = dir.toString();
    const closePrevious = vscode.workspace.getConfiguration("extensionExplorer").get<boolean>("closePreviousTerminals", false);
    if (closePrevious) {
      for (const [otherKey, terminal] of this.terminals) {
        if (otherKey !== key) { terminal.dispose(); this.terminals.delete(otherKey); }
      }
    }
    let terminal = this.terminals.get(key);
    const actualCwd = terminal?.shellIntegration?.cwd;
    // If the user changed cwd, preserve that shell and create a fresh one at the requested folder.
    if (actualCwd && actualCwd.toString() !== key) terminal = undefined;
    if (!terminal) {
      terminal = vscode.window.createTerminal({ name: `Explorer Pro: ${path.basename(dir.fsPath) || dir.fsPath}`, cwd: dir });
      this.terminals.set(key, terminal);
    }
    terminal.show(true);
  }

  public dispose(): void {
    this.listener.dispose();
    // User shells may contain running jobs; do not close them on extension deactivation.
    this.terminals.clear();
  }
}
