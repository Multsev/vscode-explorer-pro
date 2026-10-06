import { StoredFolder, WorkspaceSnapshot } from "./focusState";
export type RecoveryAction = "locate" | "surviving" | "empty" | "cancel";
export interface RecoveryHost {
  available(uri: string): Promise<boolean>;
  choose(surviving: number, total: number): Promise<RecoveryAction | undefined>;
  locate(): Promise<string | undefined>;
  workspace(folders: StoredFolder[]): Promise<string>;
}
export async function recoverWorkspace(snapshot: WorkspaceSnapshot, host: RecoveryHost): Promise<string | undefined> {
  const surviving: StoredFolder[] = [];
  for (const folder of snapshot.folders) if (await host.available(folder.uri)) surviving.push(folder);
  const action = await host.choose(surviving.length, snapshot.folders.length);
  if (action === "locate") return host.locate();
  if (action === "empty") return host.workspace([]);
  if (action === "surviving" && surviving.length) return host.workspace(surviving);
  return undefined;
}
