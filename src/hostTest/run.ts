import * as vscode from "vscode";
import * as assert from "assert";
import * as fs from "fs/promises";
import * as path from "path";
import { VscodeFocusHost } from "../focus/vscodeFocusHost";
import { FocusState } from "../focus/focusState";
import { ExplorerItem } from "../tree/explorerItem";

type ExtensionApi = {
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
      const manifest = JSON.parse(await fs.readFile(path.join(extension.extensionPath, "package.json"), "utf8"));
      const registered = await vscode.commands.getCommands(true);
      for (const c of manifest.contributes.commands) assert.ok(registered.includes(c.command), `Missing command ${c.command}`);
      await vscode.commands.executeCommand("extensionExplorer.focusFolder", child);
      assert.deepEqual(api.focusState()?.original.folders.map(f => f.name), ["Main", "Second"]);
    } else if (phase === "nested") {
      assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.toString(), child.toString());
      assert.equal(api.focusState()?.original.workspaceFile, vscode.Uri.file(originalFile).toString());
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
