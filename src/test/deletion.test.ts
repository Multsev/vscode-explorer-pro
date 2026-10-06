import * as assert from "assert";
import { deleteToTrash, deletionPlan, selectedTargets, DeleteHost } from "../services/deletion";
const target = (fsPath: string) => ({ fsPath, uri: `file://${fsPath}` });
describe("Multi-selection deletion", () => {
  it("uses the whole selection when context-clicking a selected item", () => {
    const a = target("/root/a"), b = target("/root/b"); assert.deepEqual(selectedTargets(a, [a, b]), [a, b]);
  });
  it("uses only an unselected context-clicked item", () => {
    const a = target("/root/a"), b = target("/root/b"); assert.deepEqual(selectedTargets(b, [a]), [b]);
  });
  it("deduplicates and collapses selected folders with their children", () => {
    assert.deepEqual(deletionPlan([target("/root/a"), target("/root/a/file"), target("/root/a"), target("/root/ab")], "/root"), [target("/root/a"), target("/root/ab")]);
  });
  it("protects the navigator root and ancestors", () => {
    assert.throws(() => deletionPlan([target("/root")], "/root"));
    assert.throws(() => deletionPlan([target("/")], "/root"));
  });
  function host(confirm: boolean, dirty: string[] = []): DeleteHost {
    return { confirm: async () => confirm, dirtyPaths: () => dirty, trash: async () => undefined };
  }
  it("cancellation makes no changes", async () => {
    const h = host(false); h.trash = async () => { throw Error("Should not run"); };
    assert.deepEqual(await deleteToTrash([target("/root/a")], "/root", h), { deleted: [], failed: [] });
  });
  it("protects unsaved documents inside a selected folder", async () => {
    await assert.rejects(deleteToTrash([target("/root/a")], "/root", host(true, ["/root/a/file"])), /несохранёнными/);
  });
  it("reports partial failures and continues the rest of the selection", async () => {
    const h = host(true); h.trash = async entry => { if (entry.fsPath.endsWith("a")) throw Error("Trash unavailable"); };
    const result = await deleteToTrash([target("/root/a"), target("/root/b")], "/root", h);
    assert.deepEqual(result.deleted, [target("/root/b")]); assert.equal(result.failed.length, 1);
  });
  it("rechecks dirty documents after confirmation", async () => {
    const h = host(true); let dirty = false; h.dirtyPaths = () => dirty ? ["/root/a"] : [];
    h.confirm = async () => { dirty = true; return true; };
    await assert.rejects(deleteToTrash([target("/root/a")], "/root", h), /появились/);
  });
});
