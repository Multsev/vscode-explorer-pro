import * as vscode from "vscode";
import { EXTENSION_NAMESPACE } from "./constants";

export type SortMode = "name" | "typeThenName" | "mtime";

export type ExtensionExplorerConfig = {
  startPath: string | null;
  showHidden: boolean;
  sortMode: SortMode;
  doubleClickTimeoutMs: number;
  historyMaxLength: number;
  openFilesOnSingleClick: boolean;
  openFilesInPreview: boolean;
  enterFolderOnDoubleClick: boolean;
  persistState: boolean;
  openTerminalOnEnter: boolean;
};

export function getConfig(): ExtensionExplorerConfig {
  const cfg = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE);

  return {
    startPath: cfg.get<string | null>("startPath", null),
    showHidden: cfg.get<boolean>("showHidden", false),
    sortMode: cfg.get<SortMode>("sortMode", "typeThenName"),
    doubleClickTimeoutMs: cfg.get<number>("doubleClickTimeoutMs", 400),
    historyMaxLength: cfg.get<number>("historyMaxLength", 100),
    openFilesOnSingleClick: cfg.get<boolean>("openFilesOnSingleClick", true),
    openFilesInPreview: cfg.get<boolean>("openFilesInPreview", true),
    enterFolderOnDoubleClick: cfg.get<boolean>("enterFolderOnDoubleClick", true),
    persistState: cfg.get<boolean>("persistState", false),
    openTerminalOnEnter: cfg.get<boolean>("openTerminalOnEnter", false)
  };
}
