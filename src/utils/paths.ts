import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

export function resolveStartDirectory(startPath: string | null): vscode.Uri {
  if (startPath && startPath.trim().length > 0) {
    const trimmed = startPath.trim();
    if (path.isAbsolute(trimmed)) {
      return vscode.Uri.file(trimmed);
    }

    const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (firstWorkspaceFolder) {
      return vscode.Uri.file(path.resolve(firstWorkspaceFolder.uri.fsPath, trimmed));
    }

    return vscode.Uri.file(path.resolve(os.homedir(), trimmed));
  }

  const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspaceFolder) {
    return firstWorkspaceFolder.uri;
  }

  return vscode.Uri.file(os.homedir());
}

export function parentDirectory(uri: vscode.Uri): vscode.Uri {
  const parent = path.dirname(uri.fsPath);
  return vscode.Uri.file(parent);
}

export function isSamePath(a: vscode.Uri, b: vscode.Uri): boolean {
  return normalizeFsPath(a.fsPath) === normalizeFsPath(b.fsPath);
}

function normalizeFsPath(fsPath: string): string {
  return process.platform === "win32" ? fsPath.toLowerCase() : fsPath;
}
