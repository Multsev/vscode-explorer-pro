import * as vscode from "vscode";

export class ExplorerItem extends vscode.TreeItem {
  public readonly uri: vscode.Uri;
  public readonly isDirectory: boolean;

  public constructor(params: {
    uri: vscode.Uri;
    label: string;
    isDirectory: boolean;
  }) {
    super(
      params.label,
      params.isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.uri = params.uri;
    this.isDirectory = params.isDirectory;

    this.id = this.uri.toString();
    this.resourceUri = this.uri;
    this.command = { command: "extensionExplorer.click", title: "Open", arguments: [this] };
    this.contextValue = this.isDirectory
      ? "extensionExplorer.folder"
      : "extensionExplorer.file";

    this.iconPath = this.isDirectory
      ? vscode.ThemeIcon.Folder
      : vscode.ThemeIcon.File;
  }
}
