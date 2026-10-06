import * as vscode from "vscode";
import * as path from "path";
import { randomUUID } from "crypto";
import { FocusHost } from "./workspaceFocus";
import { FocusState, isFocusState, WorkspaceSnapshot } from "./focusState";

export class VscodeFocusHost implements FocusHost {
  private readonly directory: vscode.Uri;
  public constructor(context: vscode.ExtensionContext) {
    const storage = context.globalStorageUri;
    if (storage.scheme !== "file" && storage.scheme !== "vscode-userdata") throw new Error("Local extension storage is required.");
    // Recent desktop builds expose local storage as vscode-userdata; openFolder needs a file URI.
    this.directory = vscode.Uri.joinPath(vscode.Uri.file(storage.fsPath), "focus-workspaces");
  }

  public snapshot(): WorkspaceSnapshot {
    return {
      workspaceFile: vscode.workspace.workspaceFile?.toString(),
      folders: (vscode.workspace.workspaceFolders ?? []).map(f => ({ uri: f.uri.toString(), name: f.name }))
    };
  }

  public async validateFolder(value: string): Promise<void> {
    const uri = vscode.Uri.parse(value);
    if (uri.scheme !== "file") throw new Error("Only local folders are supported.");
    const stat = await vscode.workspace.fs.stat(uri);
    if (!(stat.type & vscode.FileType.Directory)) throw new Error(`Not a folder: ${uri.fsPath}`);
  }

  public async load(): Promise<FocusState | undefined> {
    const workspace = vscode.workspace.workspaceFile;
    if (!workspace || workspace.scheme !== this.directory.scheme || path.dirname(workspace.fsPath) !== this.directory.fsPath) return;
    try {
      const data = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(workspace)).toString("utf8"));
      const state: unknown = data.explorerProFocus;
      if (!isFocusState(state)) return;
      const folders = vscode.workspace.workspaceFolders ?? [];
      // An unrelated window cannot consume a global handoff, and manual edits invalidate stale focus UI.
      if (folders.length !== 1 || folders[0]!.uri.toString() !== state.history[state.cursor]) return;
      return state;
    } catch { return; }
  }

  public async prepareFocus(state: FocusState): Promise<string> {
    const target = state.history[state.cursor]!;
    return this.write({ folders: [{ uri: target }], explorerProFocus: state }, "focus");
  }

  public async prepareRestore(snapshot: WorkspaceSnapshot): Promise<string | undefined> {
    if (snapshot.workspaceFile && vscode.Uri.parse(snapshot.workspaceFile).scheme !== "untitled") {
      const uri = vscode.Uri.parse(snapshot.workspaceFile);
      await vscode.workspace.fs.stat(uri);
      return snapshot.workspaceFile;
    }
    for (const folder of snapshot.folders) await this.validateFolder(folder.uri);
    if (!snapshot.workspaceFile && snapshot.folders.length === 1) return snapshot.folders[0]!.uri;
    // An empty workspace is opened explicitly; vscode.openFolder(undefined) would show a folder picker.
    return this.write({ folders: snapshot.folders }, "restored");
  }

  public async open(value: string | undefined): Promise<boolean> {
    if (!value) throw new Error("Missing workspace destination.");
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.parse(value), { forceReuseWindow: true });
    // Dispatch can return before the window reloads, or the user can cancel saving dirty editors.
    // Only the destination host may advertise the new focus; the old host keeps its return state.
    const current = vscode.workspace.workspaceFile?.toString();
    return current === value || (!current && vscode.workspace.workspaceFolders?.length === 1 && vscode.workspace.workspaceFolders[0]!.uri.toString() === value);
  }

  private async write(content: unknown, prefix: string): Promise<string> {
    await vscode.workspace.fs.createDirectory(this.directory);
    const uri = vscode.Uri.joinPath(this.directory, `${prefix}-${randomUUID()}.code-workspace`);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(content, null, 2)));
    return uri.toString();
  }
}
