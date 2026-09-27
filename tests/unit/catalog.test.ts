import { describe, expect, it } from "vitest";
import { planTrackerMerge } from "@/lib/catalog";

describe("planTrackerMerge", () => {
  it("moves trackers of users who only tracked the duplicate", () => {
    const plan = planTrackerMerge([{ id: "t2", user_id: "u2" }], [{ id: "t1", user_id: "u1" }]);
    expect(plan).toEqual({ move: ["t2"], collapse: [] });
  });

  it("collapses a user's second tracker into the one they already have", () => {
    // The user added the same Crocs twice via two different share links.
    const plan = planTrackerMerge([{ id: "crocs-b", user_id: "u1" }], [{ id: "crocs-a", user_id: "u1" }]);
    expect(plan).toEqual({ move: [], collapse: [{ drop: "crocs-b", keep: "crocs-a" }] });
  });

  it("handles a user appearing twice in the duplicate itself", () => {
    const plan = planTrackerMerge(
      [
        { id: "x", user_id: "u3" },
        { id: "y", user_id: "u3" },
      ],
      []
    );
    expect(plan).toEqual({ move: ["x"], collapse: [{ drop: "y", keep: "x" }] });
  });
});
