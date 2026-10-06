import * as vscode from "vscode";
import * as assert from "assert";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { VscodeFocusHost } from "../focus/vscodeFocusHost";
import { FocusState } from "../focus/focusState";
import { VscodeDeleteHost } from "../services/vscodeDeleteHost";
import { contains } from "../services/deletion";
import { ExplorerItem } from "../tree/explorerItem";

type ExtensionApi = {
  select(uri: vscode.Uri): Promise<void>;
  currentDirectory(): vscode.Uri;
  children(): Promise<ExplorerItem[]>;
  focusState(): FocusState | undefined;
};

export async function run(): Promise<void> {
  const fixture = process.env.EXPLORER_TEST_FIXTURE!;
  const phase = process.env.EXPLORER_TEST_PHASE!;
  const resultFile = path.join(fixture, "result.json");
  const extension = vscode.extensions.getExtension<ExtensionApi>("max-local.explorer-pro");
  assert.ok(extension, "Unified extension must load");
  const api = await extension.activate();
  const root = vscode.Uri.file(path.join(fixture, "project"));
  const child = vscode.Uri.joinPath(root, "child");
  const deep = vscode.Uri.joinPath(child, "deeper");
  const originalFile = path.join(fixture, "original.code-workspace");
  const originalBytes = await fs.readFile(originalFile);

  // The external test runner opens each captured destination with the real VS Code executable.
  // This intercept keeps the current assertions alive instead of being terminated by openFolder.
  let destination: string | undefined;
  const realOpen = VscodeFocusHost.prototype.open;
  VscodeFocusHost.prototype.open = async function (uri) { destination = uri; return true; };
  try {
    if (phase === "navigator") {
      assert.equal(api.currentDirectory().toString(), root.toString());
      const items = await api.children();
      assert.ok(items.some(i => i.label === "child" && i.isDirectory));
      assert.ok(!items.some(i => i.label === ".hidden"));
      assert.equal(items.find(i => i.label === "linked-file")?.isDirectory, false);
      await vscode.commands.executeCommand("extensionExplorer.enter", child);
      await vscode.commands.executeCommand("extensionExplorer.goBack");
      assert.equal(api.currentDirectory().toString(), root.toString());
      await vscode.commands.executeCommand("extensionExplorer.goForward");
      assert.equal(api.currentDirectory().toString(), child.toString());
      await vscode.commands.executeCommand("extensionExplorer.goUp");
      assert.equal(api.currentDirectory().toString(), root.toString());
      const folderItem = (await api.children()).find(i => i.label === "child")!;
      await vscode.commands.executeCommand("extensionExplorer.click", folderItem);
      await vscode.commands.executeCommand("extensionExplorer.click", folderItem);
      assert.equal(api.currentDirectory().toString(), child.toString(), "Repeated clicks must enter the same selected folder");
      await vscode.commands.executeCommand("extensionExplorer.enter", root);
      const text = (await api.children()).find(i => i.label === "notes.txt")!;
      await vscode.commands.executeCommand("extensionExplorer.click", text);
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), text.uri.toString());
      await vscode.commands.executeCommand("extensionExplorer.enter", text);
      assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.isPreview, false);
      await vscode.commands.executeCommand("extensionExplorer.openTerminal", root);
      await vscode.commands.executeCommand("extensionExplorer.openTerminal", root);
      assert.equal(vscode.window.terminals.filter(t => t.name.startsWith("Explorer Pro:")).length, 1);
      await api.select(child);
      await vscode.commands.executeCommand("extensionExplorer.openTerminal");
      const folderTerminal = vscode.window.terminals.find(t => t.name === "Explorer Pro: child")!;
      assert.ok(folderTerminal);
      const folderOptions = folderTerminal.creationOptions as vscode.TerminalOptions;
      assert.equal((folderOptions.cwd as vscode.Uri).fsPath, child.fsPath);
      await api.select(text.uri);
      await vscode.commands.executeCommand("extensionExplorer.openTerminal");
      assert.equal(vscode.window.terminals.filter(t => t.name === "Explorer Pro: project").length, 1);
      const suffix = randomUUID();
      const deleteNames = [`delete-one-${suffix}.txt`, `delete-two-${suffix}.txt`, `delete-folder-${suffix}`];
      await fs.writeFile(path.join(root.fsPath, deleteNames[0]!), "fixture");
      await fs.writeFile(path.join(root.fsPath, deleteNames[1]!), "fixture");
      await fs.mkdir(path.join(root.fsPath, deleteNames[2]!));
      await fs.writeFile(path.join(root.fsPath, deleteNames[2]!, "nested.txt"), "fixture");
      const deleteItems = (await api.children()).filter(item => deleteNames.includes(String(item.label)));
      assert.equal(deleteItems.length, 3);
      const realConfirm = VscodeDeleteHost.prototype.confirm;
      VscodeDeleteHost.prototype.confirm = async targets => {
        assert.ok(targets.every(target => contains(root.fsPath, target.fsPath)), "Delete only isolated test fixtures");
        return true;
      };
      try {
        await vscode.commands.executeCommand("extensionExplorer.delete", deleteItems[0], deleteItems);
      } finally { VscodeDeleteHost.prototype.confirm = realConfirm; }
      for (const name of deleteNames) await assert.rejects(fs.stat(path.join(root.fsPath, name)), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
      const manifest = JSON.parse(await fs.readFile(path.join(extension.extensionPath, "package.json"), "utf8"));
      const registered = await vscode.commands.getCommands(true);
      for (const c of manifest.contributes.commands) assert.ok(registered.includes(c.command), `Missing command ${c.command}`);
      await vscode.commands.executeCommand("extensionExplorer.focusFolder", child);
      assert.deepEqual(api.focusState()?.original.folders.map(f => f.name), ["Main", "Second"]);
    } else if (phase === "nested") {
      assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.toString(), child.toString());
      assert.equal(api.focusState()?.original.workspaceFile, vscode.Uri.file(originalFile).toString());
      const directory = path.dirname(vscode.workspace.workspaceFile!.fsPath);
      const oldNames: string[] = [];
      for (let i = 0; i < 25; i++) {
        const file = path.join(directory, `restored-${randomUUID()}.code-workspace`);
        await fs.writeFile(file, JSON.stringify({ explorerProManaged: 1, folders: [] }));
        const time = new Date(Date.now() - (60 + i) * 86400000);
        await fs.utimes(file, time, time); oldNames.push(file);
      }
      const protectedFile = oldNames[24]!;
      await fs.writeFile(path.join(directory, `lease-${process.ppid}.json`), JSON.stringify({ pid: process.ppid, workspace: vscode.Uri.file(protectedFile).toString() }));
      const unrelated = path.join(directory, "unrelated.code-workspace");
      await fs.writeFile(unrelated, "{}");
      await vscode.commands.executeCommand("extensionExplorer.cleanupWorkspaces");
      await fs.stat(protectedFile); await fs.stat(unrelated); await fs.stat(vscode.workspace.workspaceFile!.fsPath);
      let retained = 0;
      for (const file of oldNames) try { await fs.stat(file); retained++; } catch { /* Expected removed candidate. */ }
      assert.ok(retained < 25 && retained >= 20, "Cleanup must remove old files while retaining recent and active workspaces");
      await vscode.commands.executeCommand("extensionExplorer.focusFolder", deep);
    } else if (phase === "back") {
      assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.toString(), deep.toString());
      assert.equal(api.focusState()?.history.length, 2);
      await vscode.commands.executeCommand("extensionExplorer.focusBack");
    } else if (phase === "restore") {
      assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.toString(), child.toString());
      assert.equal(api.focusState()?.cursor, 0);
      await vscode.commands.executeCommand("extensionExplorer.restoreWorkspace");
      assert.equal(destination, vscode.Uri.file(originalFile).toString());
    } else if (phase === "restored") {
      assert.equal(vscode.workspace.workspaceFile?.toString(), vscode.Uri.file(originalFile).toString());
      assert.deepEqual(vscode.workspace.workspaceFolders?.map(f => f.name), ["Main", "Second"]);
      assert.equal(api.focusState(), undefined);
    } else { throw Error(`Unknown phase ${phase}`); }
    assert.deepEqual(await fs.readFile(originalFile), originalBytes, "Original workspace must remain unchanged");
    await fs.writeFile(resultFile, JSON.stringify({ phase, destination, passed: true }));
    console.log(`Explorer Pro host phase passed: ${phase}`);
  } finally { VscodeFocusHost.prototype.open = realOpen; }
}
