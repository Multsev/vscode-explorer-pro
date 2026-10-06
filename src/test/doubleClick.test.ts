import * as assert from "assert";
import { DoubleClickTracker } from "../controller/doubleClickTracker";
describe("Double click", () => {
  it("pairs two clicks on the same item without treating the third click as another double", () => {
    const tracker = new DoubleClickTracker();
    assert.equal(tracker.isDoubleClick("a", 100, 400), false);
    assert.equal(tracker.isDoubleClick("a", 150, 400), true);
    assert.equal(tracker.isDoubleClick("a", 200, 400), false);
  });
  it("rejects different items and expired clicks", () => {
    const tracker = new DoubleClickTracker();
    tracker.isDoubleClick("a", 100, 400);
    assert.equal(tracker.isDoubleClick("b", 150, 400), false);
    assert.equal(tracker.isDoubleClick("b", 800, 400), false);
  });
});
