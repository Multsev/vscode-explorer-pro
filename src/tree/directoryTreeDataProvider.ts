import * as path from "path";
import { parentDirectory, isSamePath } from "../utils/paths";
import * as vscode from "vscode";
import { getConfig, SortMode } from "../config";
import { statWithSymlinkResolution } from "../utils/fs";
import { ExplorerItem } from "./explorerItem";

export class DirectoryTreeDataProvider
  implements vscode.TreeDataProvider<ExplorerItem>
{
  private _root: vscode.Uri;
  private readonly onError: (err: unknown) => void;
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ExplorerItem | void>();

  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public constructor(root: vscode.Uri, onError: (err: unknown) => void) {
    this._root = root;
    this.onError = onError;
  }

  public dispose(): void { this._onDidChangeTreeData.dispose(); }

  public setRoot(root: vscode.Uri): void {
    this._root = root;
    this.refresh();
  }

  public getRoot(): vscode.Uri {
    return this._root;
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: ExplorerItem): ExplorerItem | undefined {
    const parent = parentDirectory(element.uri);
    const relative = path.relative(this._root.fsPath, parent.fsPath);
    if (isSamePath(parent, this._root) || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
    return new ExplorerItem({ uri: parent, label: path.basename(parent.fsPath), isDirectory: true });
  }

  public async getChildren(element?: ExplorerItem): Promise<ExplorerItem[]> {
    const dir = element?.isDirectory ? element.uri : this._root;
    if (element && !element.isDirectory) {
      return [];
    }

    try {
      return await this.readDirectoryItems(dir);
    } catch (err) {
      this.onError(err);
      return [];
    }
  }

  private async readDirectoryItems(dir: vscode.Uri): Promise<ExplorerItem[]> {
    const config = getConfig();
    const pairs = await vscode.workspace.fs.readDirectory(dir);

    const maybeItems = await Promise.allSettled(
      pairs
        .filter(([name]) => config.showHidden || !isHiddenName(name))
        .map(async ([name, fileType]) => {
          const childUri = vscode.Uri.joinPath(dir, name);
          const isSymlink = (fileType & vscode.FileType.SymbolicLink) !== 0;

          if (config.sortMode === "mtime" || isSymlink) {
            const info = await statWithSymlinkResolution(childUri);
            return {
              uri: childUri,
              name,
              isDirectory: info.isDirectory,
              mtimeMs: info.mtimeMs
            };
          }

          return {
            uri: childUri,
            name,
            isDirectory: (fileType & vscode.FileType.Directory) !== 0,
            mtimeMs: null
          };
        })
    );

    const items = maybeItems
      .filter(
        (r): r is PromiseFulfilledResult<{
          uri: vscode.Uri;
          name: string;
          isDirectory: boolean;
          mtimeMs: number | null;
        }> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    items.sort((a, b) => compareEntries(a, b, config.sortMode));

    return items.map(
      (e) =>
        new ExplorerItem({
          uri: e.uri,
          label: e.name,
          isDirectory: e.isDirectory
        })
    );
  }
}

function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

function compareEntries(
  a: { name: string; isDirectory: boolean; mtimeMs: number | null },
  b: { name: string; isDirectory: boolean; mtimeMs: number | null },
  sortMode: SortMode
): number {
  if (sortMode === "mtime") {
    const am = a.mtimeMs ?? 0;
    const bm = b.mtimeMs ?? 0;
    if (bm !== am) {
      return bm - am;
    }
  }

  if (sortMode === "typeThenName" || sortMode === "mtime") {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
  }

  const aKey = a.name;
  const bKey = b.name;
  const cmp = aKey.localeCompare(bKey, undefined, { numeric: true });
  if (cmp !== 0) {
    return cmp;
  }

  return 0;
}
