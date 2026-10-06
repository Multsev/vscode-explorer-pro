import * as vscode from "vscode";
import { isFocusState } from "./focusState";
import { cleanupCandidates, ManagedWorkspace } from "./cleanupPolicy";

export class WorkspaceCleanup implements vscode.Disposable {
  private readonly directory: vscode.Uri;
  private readonly lease: vscode.Uri;
  public constructor(context: vscode.ExtensionContext) {
    this.directory = vscode.Uri.joinPath(vscode.Uri.file(context.globalStorageUri.fsPath), "focus-workspaces");
    this.lease = vscode.Uri.joinPath(this.directory, `lease-${process.pid}.json`);
  }
  public async initialize(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.directory);
    await vscode.workspace.fs.writeFile(this.lease, Buffer.from(JSON.stringify({ pid: process.pid, workspace: vscode.workspace.workspaceFile?.toString() })));
  }
  public async clean(): Promise<number> {
    const files: ManagedWorkspace[] = [];
    const active = [vscode.workspace.workspaceFile?.toString()].filter((value): value is string => !!value);
    for (const [name, type] of await vscode.workspace.fs.readDirectory(this.directory)) {
      if (type !== vscode.FileType.File) continue;
      const uri = vscode.Uri.joinPath(this.directory, name);
      try {
        if (/^lease-\d+\.json$/.test(name)) {
          const lease = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString());
          if (!Number.isInteger(lease.pid) || lease.pid <= 0) continue;
          try { process.kill(lease.pid, 0); if (typeof lease.workspace === "string") active.push(lease.workspace); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") await vscode.workspace.fs.delete(uri);
            else if (typeof lease.workspace === "string") active.push(lease.workspace);
          }
          continue;
        }
        if (!/^(focus|restored)-[0-9a-f-]{36}\.code-workspace$/.test(name)) continue;
        const content = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString());
        const state = content.explorerProFocus;
        if (content.explorerProManaged !== 1 && !isFocusState(state)) continue;
        const stat = await vscode.workspace.fs.stat(uri);
        files.push({ uri: uri.toString(), modified: stat.mtime, references: isFocusState(state) && state.original.workspaceFile ? [state.original.workspaceFile] : [] });
      } catch { /* A concurrently changing or unreadable file is retained. */ }
    }
    let removed = 0;
    for (const value of cleanupCandidates(files, active, Date.now())) {
      try { await vscode.workspace.fs.delete(vscode.Uri.parse(value)); removed++; } catch { /* Keep failures for the next run. */ }
    }
    return removed;
  }
  public dispose(): void {
    void vscode.workspace.fs.delete(this.lease).then(undefined, () => undefined);
  }
}
