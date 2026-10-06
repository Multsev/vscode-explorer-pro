import * as path from "path";
export type DeleteTarget = { uri: string; fsPath: string };
function same(a: string, b: string): boolean { return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b; }
export function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
export function selectedTargets(clicked: DeleteTarget | undefined, selection: DeleteTarget[]): DeleteTarget[] {
  return clicked && !selection.some(item => same(item.fsPath, clicked.fsPath)) ? [clicked] : selection;
}
export function deletionPlan(targets: DeleteTarget[], root: string): DeleteTarget[] {
  const unique = targets.filter((item, index) => targets.findIndex(other => same(other.fsPath, item.fsPath)) === index);
  if (unique.some(item => contains(item.fsPath, root))) throw new Error("Нельзя удалить текущий корень навигатора или его родительскую папку. Перейдите на уровень выше.");
  return unique.filter(item => !unique.some(parent => parent !== item && contains(parent.fsPath, item.fsPath)));
}
export interface DeleteHost {
  dirtyPaths(): string[];
  confirm(targets: DeleteTarget[]): Promise<boolean>;
  trash(target: DeleteTarget): Promise<void>;
}
export async function deleteToTrash(targets: DeleteTarget[], root: string, host: DeleteHost): Promise<{ deleted: DeleteTarget[]; failed: { target: DeleteTarget; error: string }[] }> {
  const plan = deletionPlan(targets, root);
  const result: { deleted: DeleteTarget[]; failed: { target: DeleteTarget; error: string }[] } = { deleted: [], failed: [] };
  if (!plan.length) return result;
  if (host.dirtyPaths().some(file => plan.some(target => contains(target.fsPath, file)))) throw new Error("В выбранных элементах есть файлы с несохранёнными изменениями. Сначала сохраните или отмените изменения.");
  if (!await host.confirm(plan)) return result;
  // Re-check after the modal dialog: a dirty editor may have appeared while confirmation was open.
  if (host.dirtyPaths().some(file => plan.some(target => contains(target.fsPath, file)))) throw new Error("Удаление отменено: появились несохранённые изменения.");
  for (const target of plan) {
    try { await host.trash(target); result.deleted.push(target); }
    catch (error) { result.failed.push({ target, error: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}
