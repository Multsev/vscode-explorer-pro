import * as fs from "fs/promises";
import * as vscode from "vscode";

export type FsEntryInfo = {
  isDirectory: boolean;
  isSymbolicLink: boolean;
  mtimeMs: number | null;
};

export async function statWithSymlinkResolution(
  uri: vscode.Uri
): Promise<FsEntryInfo> {
  const stat = await vscode.workspace.fs.stat(uri);
  const isSymbolicLink = (stat.type & vscode.FileType.SymbolicLink) !== 0;
  const isDirectory =
    (stat.type & vscode.FileType.Directory) !== 0 ||
    (stat.type & vscode.FileType.SymbolicLink) !== 0;

  let resolvedIsDirectory = (stat.type & vscode.FileType.Directory) !== 0;
  let resolvedMtime: number | null = stat.mtime ?? null;

  if (isSymbolicLink && uri.scheme === "file") {
    try {
      const followed = await fs.stat(uri.fsPath);
      resolvedIsDirectory = followed.isDirectory();
      resolvedMtime = followed.mtimeMs;
    } catch {
      // ignore and fall back to workspace.fs stat
    }
  }

  return {
    isDirectory: isSymbolicLink ? resolvedIsDirectory : isDirectory,
    isSymbolicLink,
    mtimeMs: resolvedMtime
  };
}

export async function resolveRealPath(uri: vscode.Uri): Promise<vscode.Uri> {
  if (uri.scheme !== "file") {
    return uri;
  }
  try {
    const real = await fs.realpath(uri.fsPath);
    return vscode.Uri.file(real);
  } catch {
    return uri;
  }
}
