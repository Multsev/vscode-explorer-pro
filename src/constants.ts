export const EXTENSION_NAMESPACE = "extensionExplorer";

export const VIEW_ID = "extensionExplorer";

export const COMMANDS = {
  goBack: "extensionExplorer.goBack",
  goForward: "extensionExplorer.goForward",
  goUp: "extensionExplorer.goUp",
  goToRoot: "extensionExplorer.goToRoot",
  enter: "extensionExplorer.enter",
  refresh: "extensionExplorer.refresh",
  copyPath: "extensionExplorer.copyPath",
  revealInVscodeExplorer: "extensionExplorer.revealInVscodeExplorer"
} as const;

export const CONTEXT_KEYS = {
  canGoBack: "extensionExplorer.canGoBack",
  canGoForward: "extensionExplorer.canGoForward",
  canGoUp: "extensionExplorer.canGoUp"
} as const;

export const STATE_KEY = "extensionExplorer.state.v1";

