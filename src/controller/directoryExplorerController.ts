import * as vscode from "vscode";
import { getConfig } from "../config";
import { COMMANDS, CONTEXT_KEYS, STATE_KEY, VIEW_ID } from "../constants";
import { NavigationHistory } from "../history/navigationHistory";
import { statWithSymlinkResolution, resolveRealPath } from "../utils/fs";
import { isSamePath, parentDirectory, resolveStartDirectory } from "../utils/paths";
import { DirectoryTreeDataProvider } from "../tree/directoryTreeDataProvider";
import { ExplorerItem } from "../tree/explorerItem";
import { getStateMemento } from "../state/mementoState";
import { DoubleClickTracker } from "./doubleClickTracker";
import { TerminalService } from "../services/terminalService";
import { FocusController } from "../focus/focusController";

type PersistedState = {
  history: string[];
  cursor: number;
};

export class DirectoryExplorerController implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly output: vscode.OutputChannel;
  private readonly terminals: TerminalService;
  private readonly focus: FocusController;
  private readonly watchers: vscode.Disposable[] = [];
  private pendingOperation: Promise<unknown> = Promise.resolve();
  public ready: Promise<void>;

  public readonly provider: DirectoryTreeDataProvider;
  private readonly treeView: vscode.TreeView<ExplorerItem>;

  private history: NavigationHistory<string>;
  private readonly doubleClick = new DoubleClickTracker();

  private startDir: vscode.Uri;
  private watcher: vscode.FileSystemWatcher | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  public constructor(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    terminals: TerminalService,
    focus: FocusController
  ) {
    this.context = context;
    this.output = output;
    this.terminals = terminals;
    this.focus = focus;

    const cfg = getConfig();
    this.startDir = resolveStartDirectory(cfg.startPath);

    this.history = new NavigationHistory<string>(this.startDir.fsPath, cfg.historyMaxLength);
    this.tryRestoreState();

    this.provider = new DirectoryTreeDataProvider(this.currentDirectory(), (err) =>
      this.handleProviderError(err)
    );
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this.provider,
      showCollapseAll: true
    });

    this.treeView.description = this.provider.getRoot().fsPath;

    this.context.subscriptions.push(this.treeView);
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => void this.onConfigChanged(e))
    );

    this.registerCommands();
    this.updateContexts();
    this.updateWatcher();
    this.ready = this.sanitizeRestoredState().catch(error => this.handleProviderError(error));
  }

  public dispose(): void {
    this.disposeWatcher();
    this.provider.dispose();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public getCurrentDirectory(): vscode.Uri { return this.currentDirectory(); }

  private run(operation: () => Promise<unknown>): Promise<unknown> {
    const next = this.pendingOperation.then(() => this.ready).then(operation);
    this.pendingOperation = next.catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[command] ${message}`);
      void vscode.window.showErrorMessage(`Explorer Pro: ${message}`);
    });
    return next;
  }

  private targetUri(item?: ExplorerItem | vscode.Uri): vscode.Uri {
    return item instanceof vscode.Uri ? item : item?.uri ?? this.currentDirectory();
  }

  private registerCommands(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(COMMANDS.goBack, () => this.run(() => this.goBack())),
      vscode.commands.registerCommand(COMMANDS.goForward, () => this.run(() => this.goForward())),
      vscode.commands.registerCommand(COMMANDS.goUp, () => this.run(() => this.goUp())),
      vscode.commands.registerCommand(COMMANDS.goToRoot, () => this.run(() => this.goToRoot())),
      vscode.commands.registerCommand(COMMANDS.refresh, () => this.provider.refresh()),
      vscode.commands.registerCommand(COMMANDS.enter, (item?: ExplorerItem | vscode.Uri) => this.run(() => this.enter(item))),
      vscode.commands.registerCommand(COMMANDS.copyPath, (item?: ExplorerItem) =>
        this.run(() => this.copyPath(item))
      ),
      vscode.commands.registerCommand(
        COMMANDS.revealInVscodeExplorer,
        (item?: ExplorerItem) => this.run(() => this.revealInVscodeExplorer(item))
      ),
      vscode.commands.registerCommand("extensionExplorer.click", (item: ExplorerItem) => this.run(() => this.onItemClicked(item))),
      vscode.commands.registerCommand("extensionExplorer.pickRoot", () => this.run(async () => {
        const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: this.currentDirectory() });
        if (selected?.[0]) await this.enterDirectory(selected[0]);
      })),
      vscode.commands.registerCommand("extensionExplorer.openTerminal", (item?: ExplorerItem | vscode.Uri) => this.run(async () => this.terminals.open(this.targetUri(item)))),
      vscode.commands.registerCommand("extensionExplorer.focusFolder", (item?: ExplorerItem | vscode.Uri) => this.run(() => this.focus.focus(this.targetUri(item)))),
      vscode.commands.registerCommand("extensionExplorer.restoreWorkspace", () => this.run(() => this.focus.restore())),
      vscode.commands.registerCommand("extensionExplorer.focusBack", () => this.run(() => this.focus.back())),
      vscode.commands.registerCommand("extensionExplorer.saveRoot", (item?: ExplorerItem | vscode.Uri) => this.run(async () => {
        const uri = this.targetUri(item);
        if (!await this.ensureDirectoryExists(uri)) return;
        await this.context.globalState.update("extensionExplorer.home", uri.toString());
        void vscode.window.showInformationMessage(`Explorer Pro: Home folder saved: ${uri.fsPath}`);
      })),
      vscode.commands.registerCommand("extensionExplorer.openSavedRoot", () => this.run(async () => {
        const saved = this.context.globalState.get<string>("extensionExplorer.home");
        if (!saved) { void vscode.window.showInformationMessage("Explorer Pro: Save a home folder first."); return; }
        await this.enterDirectory(vscode.Uri.parse(saved));
      }))
    );
  }

  private currentDirectory(): vscode.Uri {
    return vscode.Uri.file(this.history.current());
  }

  private selectedItem(): ExplorerItem | undefined {
    return this.treeView.selection[0];
  }

  private async onItemClicked(selection: ExplorerItem): Promise<void> {
    if (!selection) {
      return;
    }

    const cfg = getConfig();
    const id = selection.id ?? selection.uri.toString();
    const now = Date.now();
    const isDouble = this.doubleClick.isDoubleClick(
      id,
      now,
      cfg.doubleClickTimeoutMs
    );

    if (isDouble) {
      if (selection.isDirectory && cfg.enterFolderOnDoubleClick) {
        await this.enterDirectory(selection.uri);
      } else if (!selection.isDirectory) {
        await this.openFile(selection.uri, { pinned: true });
      }
      return;
    }

    if (!selection.isDirectory && cfg.openFilesOnSingleClick) {
      await this.openFile(selection.uri, { pinned: !cfg.openFilesInPreview });
    }
  }

  private onConfigChanged(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("extensionExplorer")) {
      const cfg = getConfig();
      this.history.setMaxLength(cfg.historyMaxLength);
      this.startDir = resolveStartDirectory(cfg.startPath);
      this.updateContexts();
      this.updateWatcher();
      void this.persistStateIfEnabled();
      this.provider.refresh();
    }
  }

  private handleProviderError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.output.appendLine(`[tree] ${message}`);
    void vscode.window.showErrorMessage(`Explorer Pro: ${message}`);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.provider.refresh();
    }, 150);
  }

  private updateWatcher(): void {
    this.disposeWatcher();

    const root = this.provider.getRoot();
    try {
      const pattern = new vscode.RelativePattern(root, "*");
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);


      const onChange = () => this.scheduleRefresh();
      this.watchers.push(this.watcher.onDidCreate(onChange));
      this.watchers.push(this.watcher.onDidChange(onChange));
      this.watchers.push(this.watcher.onDidDelete(onChange));
    } catch (err) {
      this.output.appendLine(
        `[watcher] Failed to create watcher for ${root.toString()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  private disposeWatcher(): void {
    for (const listener of this.watchers.splice(0)) listener.dispose();
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }
  }

  private async goBack(): Promise<void> {
    while (this.history.canGoBack()) {
      const targetIndex = this.history.cursorIndex() - 1;
      const targetPath = this.history.entries()[targetIndex]!;
      const check = await this.checkDirectory(vscode.Uri.file(targetPath));
      if (check.ok) {
        this.history.back();
        await this.applyCurrentDirectory();
        return;
      }

      const choice = await vscode.window.showErrorMessage(
        `Explorer Pro: Path in history is not accessible. ${check.reason}`,
        { modal: false },
        "Skip",
        "Cancel"
      );
      if (choice === "Skip") {
        this.history.removeAt(targetIndex);
        this.updateContexts();
        await this.persistStateIfEnabled();
        continue;
      }
      return;
    }
  }

  private async goForward(): Promise<void> {
    while (this.history.canGoForward()) {
      const targetIndex = this.history.cursorIndex() + 1;
      const targetPath = this.history.entries()[targetIndex]!;
      const check = await this.checkDirectory(vscode.Uri.file(targetPath));
      if (check.ok) {
        this.history.forward();
        await this.applyCurrentDirectory();
        return;
      }

      const choice = await vscode.window.showErrorMessage(
        `Explorer Pro: Path in history is not accessible. ${check.reason}`,
        { modal: false },
        "Skip",
        "Cancel"
      );
      if (choice === "Skip") {
        this.history.removeAt(targetIndex);
        this.updateContexts();
        await this.persistStateIfEnabled();
        continue;
      }
      return;
    }
  }

  private async goUp(): Promise<void> {
    const current = this.provider.getRoot();
    const parent = parentDirectory(current);
    if (isSamePath(parent, current)) {
      return;
    }
    await this.navigateToDirectory(parent);
  }

  private async goToRoot(): Promise<void> {
    await this.navigateToDirectory(this.startDir);
  }

  private async enter(item?: ExplorerItem | vscode.Uri): Promise<void> {
    if (item instanceof vscode.Uri) { await this.enterDirectory(item); return; }
    const selection = item ?? this.selectedItem();
    if (!selection) {
      return;
    }

    if (selection.isDirectory) {
      await this.enterDirectory(selection.uri);
      return;
    }

    await this.openFile(selection.uri, { pinned: true });
  }

  private async enterDirectory(uri: vscode.Uri): Promise<void> {
    const resolved = await resolveRealPath(uri);
    await this.navigateToDirectory(resolved);
  }

  private async navigateToDirectory(dir: vscode.Uri): Promise<void> {
    const ok = await this.ensureDirectoryExists(dir);
    if (!ok) {
      return;
    }

    if (isSamePath(dir, this.currentDirectory())) return;
    this.history.navigateTo(dir.fsPath);
    await this.applyCurrentDirectory();
  }

  private async applyCurrentDirectory(): Promise<void> {
    const root = this.currentDirectory();
    this.provider.setRoot(root);
    this.treeView.description = root.fsPath;
    this.updateContexts();
    this.updateWatcher();
    await this.openTerminalIfEnabled(root);
    await this.persistStateIfEnabled();
  }

  private updateContexts(): void {
    const root = this.currentDirectory();
    const canGoUp = !isSamePath(parentDirectory(root), root);
    void vscode.commands.executeCommand(
      "setContext",
      CONTEXT_KEYS.canGoBack,
      this.history.canGoBack()
    );
    void vscode.commands.executeCommand(
      "setContext",
      CONTEXT_KEYS.canGoForward,
      this.history.canGoForward()
    );
    void vscode.commands.executeCommand("setContext", CONTEXT_KEYS.canGoUp, canGoUp);
  }

  private async openFile(
    uri: vscode.Uri,
    opts: { pinned: boolean }
  ): Promise<void> {
    try {
      await vscode.window.showTextDocument(uri, {
        preview: !opts.pinned,
        preserveFocus: false
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[openFile] ${message}`);
      void vscode.window.showErrorMessage(`Explorer Pro: ${message}`);
    }
  }

  private async copyPath(item?: ExplorerItem): Promise<void> {
    const target = item ?? this.selectedItem();
    const uri = target?.uri ?? this.provider.getRoot();
    await vscode.env.clipboard.writeText(uri.fsPath);
  }

  private async revealInVscodeExplorer(item?: ExplorerItem): Promise<void> {
    const target = item ?? this.selectedItem();
    if (!target) {
      return;
    }
    try {
      await vscode.commands.executeCommand("revealInExplorer", target.uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[revealInExplorer] ${message}`);
    }
  }

  private async ensureDirectoryExists(dir: vscode.Uri): Promise<boolean> {
    const check = await this.checkDirectory(dir);
    if (check.ok) {
      return true;
    }
    void vscode.window.showErrorMessage(
      `Explorer Pro: Cannot use directory: ${dir.fsPath}. ${check.reason}`
    );
    return false;
  }

  private async openTerminalIfEnabled(dir: vscode.Uri): Promise<void> {
    const cfg = getConfig();
    if (!cfg.openTerminalOnEnter) {
      return;
    }

    if (vscode.workspace.isTrusted) this.terminals.open(dir);
  }

  private async checkDirectory(
    dir: vscode.Uri
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const info = await statWithSymlinkResolution(dir);
      if (!info.isDirectory) {
        return { ok: false, reason: "Not a directory." };
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[stat] ${dir.toString()}: ${message}`);
      return { ok: false, reason: message };
    }
  }

  private tryRestoreState(): void {
    const cfg = getConfig();
    if (!cfg.persistState) {
      return;
    }

    const memento = getStateMemento(this.context);
    const restored = memento.get<PersistedState>(STATE_KEY);
    if (!restored || !Array.isArray(restored.history) || restored.history.length === 0) {
      return;
    }

    const snapshot = { history: restored.history, cursor: restored.cursor };
    if (!snapshot.history.every(entry => typeof entry === "string")) return;
    this.history = NavigationHistory.fromSnapshot<string>(
      snapshot,
      cfg.historyMaxLength,
      this.startDir.fsPath
    );
  }

  private async sanitizeRestoredState(): Promise<void> {
    const cfg = getConfig();
    if (!cfg.persistState) {
      return;
    }

    const entries = [...this.history.entries()];
    if (entries.length === 0) {
      return;
    }

    const valid: string[] = [];
    for (const p of entries) {
      const check = await this.checkDirectory(vscode.Uri.file(p));
      if (check.ok) {
        valid.push(p);
      }
    }

    if (valid.length === 0) {
      const fallback = resolveStartDirectory(null);
      valid.push(fallback.fsPath);
    }

    const current = this.history.current();
    const currentIndex = valid.indexOf(current);
    const cursor =
      currentIndex >= 0
        ? currentIndex
        : Math.min(valid.length - 1, this.history.cursorIndex());

    this.history = NavigationHistory.fromSnapshot<string>(
      { history: valid, cursor },
      cfg.historyMaxLength,
      this.startDir.fsPath
    );

    await this.applyCurrentDirectory();
  }

  private async persistStateIfEnabled(): Promise<void> {
    const cfg = getConfig();
    if (!cfg.persistState) {
      return;
    }

    const memento = getStateMemento(this.context);
    const snapshot = this.history.snapshot();
    await memento.update(STATE_KEY, {
      history: snapshot.history,
      cursor: snapshot.cursor
    } satisfies PersistedState);
  }
}
