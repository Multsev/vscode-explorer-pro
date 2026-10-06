import * as vscode from "vscode";
import { DeleteHost, DeleteTarget } from "./deletion";
export class VscodeDeleteHost implements DeleteHost {
  public dirtyPaths(): string[] { return vscode.workspace.textDocuments.filter(doc => doc.isDirty && doc.uri.scheme === "file").map(doc => doc.uri.fsPath); }
  public async confirm(targets: DeleteTarget[]): Promise<boolean> {
    const names = targets.slice(0, 12).map(item => item.fsPath).join("\n");
    const more = targets.length > 12 ? `\n…ещё ${targets.length - 12}` : "";
    return await vscode.window.showWarningMessage(`Переместить в корзину выбранные элементы (${targets.length})?`, { modal: true, detail: names + more }, "В корзину") === "В корзину";
  }
  public async trash(target: DeleteTarget): Promise<void> {
    const uri = vscode.Uri.parse(target.uri);
    if (uri.scheme !== "file") throw new Error("Удаление поддерживается только для локальных файлов.");
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
  }
}
