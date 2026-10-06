import * as vscode from "vscode";
import { WorkspaceFocus } from "./workspaceFocus";
import { VscodeFocusHost } from "./vscodeFocusHost";
import { focusLabel } from "./focusLabel";
import { TerminalService } from "../services/terminalService";

export class FocusController implements vscode.Disposable {
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  public constructor(private readonly focusService: WorkspaceFocus, private readonly terminals: TerminalService) {
    this.status.command = "extensionExplorer.focusMenu";
    this.updateStatus();
  }

  public static async create(context: vscode.ExtensionContext, terminals: TerminalService): Promise<FocusController> {
    const host = new VscodeFocusHost(context);
    const state = await host.load();
    const controller = new FocusController(new WorkspaceFocus(host, state), terminals);
    if (state && vscode.workspace.isTrusted && vscode.workspace.getConfiguration("extensionExplorer").get<boolean>("openTerminalOnFocus", false)) {
      terminals.open(vscode.Uri.parse(state.history[state.cursor]!));
    }
    return controller;
  }

  public async focus(uri: vscode.Uri): Promise<void> { await this.focusService.focus(uri.toString()); this.updateStatus(); }
  public async restore(): Promise<void> { await this.focusService.restore(); this.updateStatus(); }
  public async back(): Promise<void> { await this.focusService.back(); this.updateStatus(); }
  public getState() { return this.focusService.getState(); }
  public dispose(): void { this.status.dispose(); }

  private updateStatus(): void {
    const state = this.focusService.getState();
    void vscode.commands.executeCommand("setContext", "extensionExplorer.focusActive", !!state);
    void vscode.commands.executeCommand("setContext", "extensionExplorer.focusCanGoBack", !!state);
    if (!state) { this.status.hide(); return; }
    const uri = vscode.Uri.parse(state.history[state.cursor]!);
    const label = focusLabel(uri.fsPath, state.original.folders.map(folder => vscode.Uri.parse(folder.uri).fsPath));
    this.status.text = `$(zoom-in) Фокус: ${label}`;
    this.status.tooltip = `Фокус: ${uri.fsPath}\nНажмите для выбора действия: назад, полный проект, другой фокус.`;
    this.status.show();
  }
}
