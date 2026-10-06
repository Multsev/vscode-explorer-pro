import * as assert from "assert";
import { FocusHost, WorkspaceFocus } from "../focus/workspaceFocus";
import { FocusState, isFocusState, nextFocus, WorkspaceSnapshot } from "../focus/focusState";

class Host implements FocusHost {
  public original: WorkspaceSnapshot = { folders: [{ uri: "file:///project", name: "Project" }] };
  public written: FocusState[] = [];
  public restored?: WorkspaceSnapshot;
  public opened: Array<string | undefined> = [];
  public failure?: "validate" | "prepare" | "open";
  public snapshot() { return this.original; }
  public async validateFolder(_uri: string) { if (this.failure === "validate") throw Error("Missing folder"); }
  public async prepareFocus(state: FocusState) {
    if (this.failure === "prepare") throw Error("Disk full");
    this.written.push(state); return `file:///focus-${this.written.length}.code-workspace`;
  }
  public async prepareRestore(snapshot: WorkspaceSnapshot) { this.restored = snapshot; return snapshot.workspaceFile ?? "file:///restored"; }
  public async open(uri: string | undefined) {
    if (this.failure === "open") throw Error("Opening failed");
    assert.ok(this.written.length || this.restored, "Destination must be persisted before restarting the host");
    this.opened.push(uri);
    return true;
  }
}

describe("Workspace focus", () => {
  it("keeps the original multi-root workspace through nested focus and restart", async () => {
    const host = new Host();
    host.original = { workspaceFile: "file:///team.code-workspace", folders: [{ uri: "file:///a", name: "A" }, { uri: "file:///b", name: "B" }] };
    const service = new WorkspaceFocus(host);
    await service.focus("file:///a/child");
    await service.focus("file:///a/child/deeper");
    const loaded = JSON.parse(JSON.stringify(service.getState()));
    const restarted = new WorkspaceFocus(host, loaded);
    await restarted.back();
    assert.equal(restarted.getState()?.history[0], "file:///a/child");
    await restarted.restore();
    assert.deepEqual(host.restored, host.original);
    assert.equal(host.opened.at(-1), "file:///team.code-workspace");
    assert.equal(restarted.getState(), undefined);
  });

  it("returns from the first focus to the original empty window", async () => {
    const host = new Host(); host.original = { folders: [] };
    const service = new WorkspaceFocus(host);
    await service.focus("file:///target"); await service.back();
    assert.deepEqual(host.restored, { folders: [] });
    assert.equal(service.getState(), undefined);
  });

  it("does not duplicate focus on the same folder", async () => {
    const host = new Host(); const service = new WorkspaceFocus(host);
    await service.focus("file:///target"); await service.focus("file:///target");
    assert.equal(host.written.length, 1);
  });

  it("drops the forward branch when changing focus after going back", async () => {
    const host = new Host(); const service = new WorkspaceFocus(host);
    await service.focus("file:///a"); await service.focus("file:///b"); await service.back(); await service.focus("file:///c");
    assert.deepEqual(service.getState()?.history, ["file:///a", "file:///c"]);
  });

  for (const failure of ["validate", "prepare", "open"] as const) {
    it(`preserves recoverable state when ${failure} fails`, async () => {
      const host = new Host(); const service = new WorkspaceFocus(host);
      await service.focus("file:///a"); const before = service.getState();
      host.failure = failure;
      await assert.rejects(service.focus("file:///b"));
      assert.strictEqual(service.getState(), before);
    });
  }

  it("retains return state when opening the original project fails", async () => {
    const host = new Host(); const service = new WorkspaceFocus(host);
    await service.focus("file:///a"); host.failure = "open";
    await assert.rejects(service.restore()); assert.ok(service.getState());
    host.failure = undefined; await service.restore(); assert.equal(service.getState(), undefined);
  });

  it("rejects overlapping workspace switches", async () => {
    const host = new Host(); let release!: () => void;
    host.open = () => new Promise<boolean>(resolve => { release = () => resolve(true); });
    const service = new WorkspaceFocus(host); const first = service.focus("file:///a");
    await assert.rejects(service.focus("file:///b"), /already in progress/);
    while (!release) await Promise.resolve(); release(); await first;
  });

  it("keeps the current state while a switch is deferred or cancelled", async () => {
    const host = new Host(); const service = new WorkspaceFocus(host);
    await service.focus("file:///a"); const before = service.getState();
    host.open = async () => false;
    await service.focus("file:///b"); assert.strictEqual(service.getState(), before);
    await service.restore(); assert.strictEqual(service.getState(), before);
  });

  it("limits history without losing the original workspace", () => {
    const original: WorkspaceSnapshot = { folders: [{ uri: "file:///original" }] };
    let state: FocusState | undefined;
    for (let i = 0; i < 80; i++) state = nextFocus(state, original, `file:///${i}`);
    assert.equal(state!.history.length, 50); assert.equal(state!.cursor, 49);
    assert.deepEqual(state!.original, original);
  });

  it("rejects corrupted persisted state", () => {
    assert.equal(isFocusState({ version: 1, history: ["file:///a"], cursor: NaN, original: { folders: [] } }), false);
    assert.equal(isFocusState({ version: 1, history: [], cursor: 0, original: { folders: [] } }), false);
    assert.equal(isFocusState(nextFocus(undefined, { folders: [] }, "file:///a")), true);
  });
});
