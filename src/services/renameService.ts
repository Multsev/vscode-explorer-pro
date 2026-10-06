import * as vscode from "vscode";
import * as path from "path";

export function validateName(name: string): string | undefined {
  if (!name.trim()) return "Введите имя файла или папки.";
  if (name === "." || name === ".." || /[\\/\x00-\x1f]/.test(name)) return "Введите имя без разделителей пути и управляющих символов.";
  if (process.platform === "win32" && (/[<>:\"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))) return "Это имя недопустимо в Windows.";
  return undefined;
}

export class RenameService {
  public async prompt(name: string): Promise<string | undefined> {
    const extension = path.extname(name);
    return vscode.window.showInputBox({
      title: "Rename", prompt: "Новое имя файла или папки", value: name,
      valueSelection: [0, extension ? name.length - extension.length : name.length],
      validateInput: validateName
    });
  }

  public async rename(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const oldName = path.basename(uri.fsPath);
    const name = await this.prompt(oldName);
    if (name === undefined || name === oldName) return undefined;
    const invalid = validateName(name);
    if (invalid) throw new Error(invalid);
    const destination = vscode.Uri.joinPath(uri, "..", name);
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(uri, destination, { overwrite: false });
    if (!await vscode.workspace.applyEdit(edit)) throw new Error("Не удалось переименовать элемент. Проверьте имя и права доступа.");
    return destination;
  }
}
