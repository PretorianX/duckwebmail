import { describe, it, expect, vi, beforeEach } from "vitest";

import { PaginationController } from "./PaginationController";
import * as email from "./email";
import { clearAllMailboxListStates } from "./messageListStore";

describe("PaginationController", () => {
  const opts = {
    apiUrl: "https://example.com/jmap",
    authHeader: "Basic dGVzdDp0ZXN0",
    accountId: "account-123",
    pageSize: 2,
    debug: false
  };

  const summaries: Record<string, any> = {
    id0: { id: "id0", subject: "Test 0" },
    id1: { id: "id1", subject: "Test 1" },
    id2: { id: "id2", subject: "Test 2" },
    id3: { id: "id3", subject: "Test 3" },
    id4: { id: "id4", subject: "Test 4" }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAllMailboxListStates();
  });

  it("loadNextPage appends ids and merges item details", async () => {
    const controller = new PaginationController(opts);

    const querySpy = vi.spyOn(email, "emailQueryWindow");
    querySpy
      .mockResolvedValueOnce({ ids: ["id1", "id2"], queryState: "qs1", total: 4, canCalculateChanges: true })
      .mockResolvedValueOnce({ ids: ["id3", "id4"], queryState: "qs1", total: 4, canCalculateChanges: true });

    vi.spyOn(email, "emailGetSummariesByIds").mockImplementation(async ({ ids }: { ids: string[] }) => ids.map((id) => summaries[id]));

    await controller.initQuery("mailbox-1");
    await controller.loadNextPage();

    const state = controller.getState();
    expect(state?.ids).toEqual(["id1", "id2", "id3", "id4"]);
    expect(state?.loadedCount).toBe(4);
    expect(state?.itemsById.get("id4")?.subject).toBe("Test 4");
  });

  it("refreshHead sets pending without applying, then applyPendingNewMessages inserts at head", async () => {
    const controller = new PaginationController(opts);

    vi.spyOn(email, "emailQueryWindow").mockResolvedValueOnce({
      ids: ["id1", "id2"],
      queryState: "qs1",
      total: 2,
      canCalculateChanges: true
    });
    vi.spyOn(email, "emailGetSummariesByIds").mockImplementation(async ({ ids }: { ids: string[] }) => ids.map((id) => summaries[id]));

    vi.spyOn(email, "emailQueryChanges").mockResolvedValueOnce({
      newQueryState: "qs2",
      added: [{ id: "id0", position: 0 }],
      removed: [],
      total: 3
    });

    await controller.initQuery("mailbox-1");
    await controller.refreshHead();

    let state = controller.getState();
    expect(state?.pendingNewCount).toBe(1);
    expect(state?.ids).toEqual(["id1", "id2"]);

    controller.applyPendingNewMessages(null);
    state = controller.getState();
    expect(state?.ids[0]).toBe("id0");
    expect(state?.pendingNewCount).toBe(0);
  });

  it("removeItem removes the id from ids and itemsById", async () => {
    const controller = new PaginationController(opts);

    vi.spyOn(email, "emailQueryWindow").mockResolvedValueOnce({
      ids: ["id1", "id2"],
      queryState: "qs1",
      total: 2,
      canCalculateChanges: true
    });
    vi.spyOn(email, "emailGetSummariesByIds").mockImplementation(async ({ ids }: { ids: string[] }) => ids.map((id) => summaries[id]));

    await controller.initQuery("mailbox-1");
    controller.removeItem("id2");

    const state = controller.getState();
    expect(state?.ids).toEqual(["id1"]);
    expect(state?.itemsById.has("id2")).toBe(false);
  });

  it("hasMore=false stops loadNextPage calls", async () => {
    const controller = new PaginationController(opts);
    const querySpy = vi.spyOn(email, "emailQueryWindow");

    querySpy.mockResolvedValueOnce({ ids: ["id1"], queryState: "qs1", total: 1, canCalculateChanges: true });
    vi.spyOn(email, "emailGetSummariesByIds").mockImplementation(async ({ ids }: { ids: string[] }) => ids.map((id) => summaries[id]));

    await controller.initQuery("mailbox-1");
    await controller.loadNextPage();

    // Only initQuery call should have happened
    expect(querySpy).toHaveBeenCalledTimes(1);
  });
});


