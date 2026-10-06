export type StoredFolder = { uri: string; name?: string };
export type WorkspaceSnapshot = { workspaceFile?: string; folders: StoredFolder[] };
export type FocusState = {
  version: 1;
  original: WorkspaceSnapshot;
  history: string[];
  cursor: number;
};

export function nextFocus(current: FocusState | undefined, original: WorkspaceSnapshot, target: string): FocusState {
  if (current?.history[current.cursor] === target) return current;
  const history = current ? current.history.slice(0, current.cursor + 1) : [];
  history.push(target);
  // Retain the initial workspace independently of the bounded navigation history.
  if (history.length > 50) history.shift();
  return { version: 1, original: current?.original ?? original, history, cursor: history.length - 1 };
}

export function previousFocus(state: FocusState): FocusState | undefined {
  return state.cursor > 0 ? { ...state, cursor: state.cursor - 1 } : undefined;
}

export function isFocusState(value: unknown): value is FocusState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<FocusState>;
  return s.version === 1 && !!s.original && Array.isArray(s.original.folders)
    && s.original.folders.every(f => !!f && typeof f.uri === "string" && (f.name === undefined || typeof f.name === "string"))
    && (s.original.workspaceFile === undefined || typeof s.original.workspaceFile === "string")
    && Array.isArray(s.history) && s.history.length > 0 && s.history.length <= 50
    && s.history.every(uri => typeof uri === "string")
    && Number.isInteger(s.cursor) && s.cursor! >= 0 && s.cursor! < s.history.length;
}
