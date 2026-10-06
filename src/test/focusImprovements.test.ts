import * as assert from "assert";
import { cleanupCandidates, ManagedWorkspace } from "../focus/cleanupPolicy";
import { focusLabel } from "../focus/focusLabel";
import { recoverWorkspace, RecoveryAction, RecoveryHost } from "../focus/recovery";
import { StoredFolder } from "../focus/focusState";

describe("Focus labels", () => {
  it("shows the project and relative nested path", () => assert.equal(focusLabel("/work/project/backend/api", ["/work/project"]), "project/backend/api"));
  it("uses a full path outside the original roots", () => assert.equal(focusLabel("/other/folder", ["/work/project"]), "/other/folder"));
  it("does not confuse matching name prefixes", () => assert.equal(focusLabel("/work/project-two/api", ["/work/project"]), "/work/project-two/api"));
});

describe("Workspace cleanup", () => {
  const now = 100 * 86400000;
  const files: ManagedWorkspace[] = Array.from({ length: 25 }, (_, i) => ({ uri: `file:///${i}`, modified: i * 86400000, references: [] }));
  it("keeps the latest twenty and active sessions", () => {
    const result = cleanupCandidates(files, ["file:///0"], now);
    assert.deepEqual(result.sort(), ["file:///1", "file:///2", "file:///3", "file:///4"]);
  });
  it("keeps recursively referenced return workspaces", () => {
    const linked = files.map(file => ({ ...file, references: file.uri === "file:///24" ? ["file:///0"] : file.uri === "file:///0" ? ["file:///1"] : [] }));
    assert.ok(!cleanupCandidates(linked, [], now).includes("file:///1"));
  });
  it("retains files younger than thirty days", () => assert.deepEqual(cleanupCandidates(files, [], 25 * 86400000), []));
});

describe("Unavailable project recovery", () => {
  const original = { folders: [{ uri: "file:///missing", name: "Missing" }, { uri: "file:///exists", name: "Existing" }] };
  function host(action: RecoveryAction | undefined) {
    let restored: StoredFolder[] | undefined;
    const adapter: RecoveryHost = {
      available: async uri => uri.endsWith("exists"), choose: async () => action,
      locate: async () => "file:///relocated", workspace: async folders => { restored = folders; return "file:///recovered.code-workspace"; }
    };
    return { adapter, restored: () => restored };
  }
  it("opens only surviving roots and preserves their names", async () => {
    const h = host("surviving"); await recoverWorkspace(original, h.adapter);
    assert.deepEqual(h.restored(), [original.folders[1]]);
  });
  it("can exit to an empty workspace", async () => {
    const h = host("empty"); await recoverWorkspace(original, h.adapter); assert.deepEqual(h.restored(), []);
  });
  it("uses the relocated project", async () => assert.equal(await recoverWorkspace(original, host("locate").adapter), "file:///relocated"));
  for (const action of ["cancel", undefined] as const) it(`keeps focus on cancellation ${action}`, async () => assert.equal(await recoverWorkspace(original, host(action).adapter), undefined));
  it("does not open an empty survivors list accidentally", async () => {
    const h = host("surviving"); assert.equal(await recoverWorkspace({ folders: [{ uri: "file:///missing" }] }, h.adapter), undefined);
  });
});
