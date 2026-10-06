import * as assert from "assert";
import { NavigationHistory } from "../history/navigationHistory";

describe("NavigationHistory", () => {
  it("starts with initial entry", () => {
    const h = new NavigationHistory("a", 10);
    assert.deepStrictEqual(h.entries(), ["a"]);
    assert.strictEqual(h.current(), "a");
    assert.strictEqual(h.cursorIndex(), 0);
  });

  it("navigates forward and trims forward history when branching", () => {
    const h = new NavigationHistory("a", 10);
    h.navigateTo("b");
    h.navigateTo("c");
    assert.strictEqual(h.current(), "c");

    h.back();
    assert.strictEqual(h.current(), "b");

    h.navigateTo("x");
    assert.deepStrictEqual(h.entries(), ["a", "b", "x"]);
    assert.strictEqual(h.current(), "x");
    assert.strictEqual(h.canGoForward(), false);
  });

  it("enforces max length by dropping oldest entries", () => {
    const h = new NavigationHistory("a", 3);
    h.navigateTo("b");
    h.navigateTo("c");
    h.navigateTo("d");
    assert.deepStrictEqual(h.entries(), ["b", "c", "d"]);
    assert.strictEqual(h.current(), "d");
    assert.strictEqual(h.cursorIndex(), 2);
  });

  it("removes entries and keeps cursor valid", () => {
    const h = new NavigationHistory("a", 10);
    h.navigateTo("b");
    h.navigateTo("c");
    h.back(); // cursor at b

    h.removeAt(2); // remove c
    assert.deepStrictEqual(h.entries(), ["a", "b"]);
    assert.strictEqual(h.current(), "b");
  });
});


describe("History recovery", () => {
  it("does not record the same folder twice", () => {
    const h = new NavigationHistory("a", 10); h.navigateTo("a");
    assert.deepEqual(h.entries(), ["a"]);
  });
  it("preserves the current folder when shrinking history after navigating back", () => {
    const h = new NavigationHistory("a", 10); h.navigateTo("b"); h.navigateTo("c"); h.navigateTo("d");
    h.back(); h.back(); h.back(); h.setMaxLength(2);
    assert.equal(h.current(), "a"); assert.deepEqual(h.entries(), ["a", "b"]);
  });
  it("restores the most recent folder when the persisted history exceeds the new limit", () => {
    const h = NavigationHistory.fromSnapshot({ history: ["a", "b", "c", "d"], cursor: 3 }, 2, "x");
    assert.equal(h.current(), "d"); assert.deepEqual(h.entries(), ["c", "d"]);
  });
  it("can skip invalid persisted cursors and preserves the last remaining entry", () => {
    const h = NavigationHistory.fromSnapshot({ history: ["a"], cursor: NaN }, 10, "x");
    h.removeAt(0); assert.equal(h.current(), "a");
  });
});
