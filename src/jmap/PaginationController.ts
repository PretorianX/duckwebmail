/**
 * Pagination controller for incremental JMAP email list loading.
 * Manages query state, windowed fetching, and consistency via queryChanges.
 */

import {
  emailGetSummariesByIds,
  emailQueryChanges,
  emailQueryWindow,
  type JmapEmailSummary
} from "./email";
import {
  clearMailboxListStatesForAccount,
  getMailboxListState,
  updateMailboxListState
} from "./messageListStore";

export interface PaginationControllerOptions {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  pageSize: number;
  query?: string;
  includeBody?: boolean;
  debug?: boolean;
}

export interface PaginationControllerState {
  mailboxId: string | null;
  ids: string[];
  itemsById: Map<string, JmapEmailSummary>;
  loadedCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingNext: boolean;
  error: string | null;
  errorNext: string | null;
  total: number | null;
  pendingNewCount: number;
  canCalculateChanges: boolean;
}

export class PaginationController {
  private options: PaginationControllerOptions;
  private currentMailboxId: string | null = null;

  constructor(options: PaginationControllerOptions) {
    this.options = options;
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log("[PaginationController]", ...args);
    }
  }

  /**
   * Initialize query for a mailbox. Resets state and loads the first page.
   */
  async initQuery(mailboxId: string): Promise<void> {
    if (this.currentMailboxId === mailboxId) {
      // Already initialized for this mailbox
      return;
    }

    this.currentMailboxId = mailboxId;
    const startTime = performance.now();

    const state = getMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      mailboxId,
      this.options.pageSize
    );

    // Reset state
    state.ids = [];
    state.itemsById.clear();
    state.loadedCount = 0;
    state.hasMore = true;
    state.loading = true;
    state.error = null;
    state.queryState = undefined;
    state.canCalculateChanges = undefined;
    state.pendingNewIds = [];
    state.lastRefreshAt = Date.now();

    try {
      this.log(`[initQuery] Loading first page for mailbox ${mailboxId}`);

      const queryResult = await emailQueryWindow({
        apiUrl: this.options.apiUrl,
        authHeader: this.options.authHeader,
        accountId: this.options.accountId,
        mailboxId,
        query: this.options.query,
        includeBody: this.options.includeBody,
        position: 0,
        limit: this.options.pageSize
      });

      const summaries = await emailGetSummariesByIds({
        apiUrl: this.options.apiUrl,
        authHeader: this.options.authHeader,
        accountId: this.options.accountId,
        ids: queryResult.ids
      });

      // Update state
      state.ids = queryResult.ids;
      state.queryState = queryResult.queryState;
      state.canCalculateChanges = queryResult.canCalculateChanges;
      state.loadedCount = queryResult.ids.length;
      state.hasMore = queryResult.ids.length === this.options.pageSize && (queryResult.total === undefined || state.loadedCount < queryResult.total);
      state.loading = false;
      state.lastRefreshAt = Date.now();

      // Store summaries
      for (const summary of summaries) {
        state.itemsById.set(summary.id, summary);
      }

      const duration = Math.round(performance.now() - startTime);
      this.log(`[initQuery] Loaded ${queryResult.ids.length} items in ${duration}ms`, {
        queryState: queryResult.queryState,
        total: queryResult.total,
        canCalculateChanges: queryResult.canCalculateChanges
      });
    } catch (err) {
      state.loading = false;
      state.error = err instanceof Error ? err.message : "Failed to load messages";
      this.log(`[initQuery] Error:`, err);
      throw err;
    }
  }

  /**
   * Load the next page of messages. Appends to existing list.
   */
  async loadNextPage(): Promise<void> {
    if (!this.currentMailboxId) {
      throw new Error("Cannot load next page: no mailbox initialized");
    }

    const state = getMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      this.options.pageSize
    );

    if (state.loadingNext || !state.hasMore) {
      return;
    }

    state.loadingNext = true;
    state.errorNext = null;
    const startTime = performance.now();

    try {
      this.log(`[loadNextPage] Loading page at position ${state.loadedCount}`);

      const queryResult = await emailQueryWindow({
        apiUrl: this.options.apiUrl,
        authHeader: this.options.authHeader,
        accountId: this.options.accountId,
        mailboxId: this.currentMailboxId,
        query: this.options.query,
        includeBody: this.options.includeBody,
        position: state.loadedCount,
        limit: this.options.pageSize
      });

      if (queryResult.ids.length === 0) {
        state.hasMore = false;
        state.loadingNext = false;
        this.log(`[loadNextPage] No more items`);
        return;
      }

      const summaries = await emailGetSummariesByIds({
        apiUrl: this.options.apiUrl,
        authHeader: this.options.authHeader,
        accountId: this.options.accountId,
        ids: queryResult.ids
      });

      // Append IDs
      state.ids.push(...queryResult.ids);
      state.loadedCount = state.ids.length;
      state.hasMore = queryResult.ids.length === this.options.pageSize && (queryResult.total === undefined || state.loadedCount < queryResult.total);

      // Store summaries
      for (const summary of summaries) {
        state.itemsById.set(summary.id, summary);
      }

      const duration = Math.round(performance.now() - startTime);
      this.log(`[loadNextPage] Loaded ${queryResult.ids.length} more items in ${duration}ms`, {
        totalLoaded: state.loadedCount,
        hasMore: state.hasMore
      });
    } catch (err) {
      state.errorNext = err instanceof Error ? err.message : "Failed to load more messages";
      this.log(`[loadNextPage] Error:`, err);
      throw err;
    } finally {
      state.loadingNext = false;
    }
  }

  /**
   * Refresh the head of the list to detect new messages.
   * Uses Email/queryChanges if supported, otherwise falls back to head requery.
   * Stores pending new IDs without applying them (to avoid scroll jump).
   */
  async refreshHead(): Promise<void> {
    if (!this.currentMailboxId) {
      return;
    }

    const state = getMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      this.options.pageSize
    );

    if (!state.queryState) {
      // No query state yet, skip refresh
      return;
    }

    const startTime = performance.now();

    try {
      if (state.canCalculateChanges) {
        // Use Email/queryChanges
        this.log(`[refreshHead] Using Email/queryChanges`);

        const changes = await emailQueryChanges({
          apiUrl: this.options.apiUrl,
          authHeader: this.options.authHeader,
          accountId: this.options.accountId,
          mailboxId: this.currentMailboxId,
          query: this.options.query,
          includeBody: this.options.includeBody,
          queryState: state.queryState
        });

        // Update queryState
        state.queryState = changes.newQueryState;

        // Find new IDs at the head (added with position < current head count)
        const newIds: string[] = [];
        for (const added of changes.added) {
          if (added.position < state.ids.length && !state.ids.includes(added.id)) {
            newIds.push(added.id);
          }
        }

        // Remove deleted IDs
        for (const removedId of changes.removed) {
          const index = state.ids.indexOf(removedId);
          if (index >= 0) {
            state.ids.splice(index, 1);
            state.itemsById.delete(removedId);
            state.loadedCount = state.ids.length;
          }
        }

        if (newIds.length > 0) {
          // Fetch summaries for new IDs
          const summaries = await emailGetSummariesByIds({
            apiUrl: this.options.apiUrl,
            authHeader: this.options.authHeader,
            accountId: this.options.accountId,
            ids: newIds
          });

          // Store summaries
          for (const summary of summaries) {
            state.itemsById.set(summary.id, summary);
          }

          // Store as pending (user must click "New messages" to apply)
          state.pendingNewIds = newIds;
        }

        const duration = Math.round(performance.now() - startTime);
        this.log(`[refreshHead] Found ${newIds.length} new items, ${changes.removed.length} removed in ${duration}ms`);
      } else {
        // Fallback: re-query head and diff
        this.log(`[refreshHead] Using head requery fallback`);

        const queryResult = await emailQueryWindow({
          apiUrl: this.options.apiUrl,
          authHeader: this.options.authHeader,
          accountId: this.options.accountId,
          mailboxId: this.currentMailboxId,
          query: this.options.query,
          includeBody: this.options.includeBody,
          position: 0,
          limit: this.options.pageSize
        });

        // Update queryState
        state.queryState = queryResult.queryState;
        state.canCalculateChanges = queryResult.canCalculateChanges;

        // Find new IDs at the head
        const currentHeadIds = state.ids.slice(0, Math.min(this.options.pageSize, state.ids.length));
        const newIds = queryResult.ids.filter((id) => !currentHeadIds.includes(id));

        if (newIds.length > 0) {
          // Fetch summaries for new IDs
          const summaries = await emailGetSummariesByIds({
            apiUrl: this.options.apiUrl,
            authHeader: this.options.authHeader,
            accountId: this.options.accountId,
            ids: newIds
          });

          // Store summaries
          for (const summary of summaries) {
            state.itemsById.set(summary.id, summary);
          }

          // Store as pending
          state.pendingNewIds = newIds;
        }

        const duration = Math.round(performance.now() - startTime);
        this.log(`[refreshHead] Found ${newIds.length} new items in ${duration}ms`);
      }

      state.lastRefreshAt = Date.now();
    } catch (err) {
      this.log(`[refreshHead] Error:`, err);
      // Don't throw - refresh failures shouldn't break the UI
    }
  }

  /**
   * Apply pending new messages to the list, preserving scroll position.
   * @param _anchorId - ID of the first visible item to anchor scroll on (reserved for future scroll anchoring)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyPendingNewMessages(_anchorId: string | null): void {
    if (!this.currentMailboxId) {
      return;
    }

    const state = getMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      this.options.pageSize
    );

    if (state.pendingNewIds.length === 0) {
      return;
    }

    const count = state.pendingNewIds.length;

    // Insert new IDs at the head
    state.ids.unshift(...state.pendingNewIds);
    state.loadedCount = state.ids.length;
    state.pendingNewIds = [];

    this.log(`[applyPendingNewMessages] Applied ${count} new messages`);
  }

  /**
   * Reset controller for a new mailbox. Saves scroll offset and switches active mailbox.
   */
  reset(mailboxId: string | null): void {
    if (this.currentMailboxId && this.currentMailboxId !== mailboxId) {
      // Save scroll offset for previous mailbox
      updateMailboxListState(
        this.options.apiUrl,
        this.options.accountId,
        this.currentMailboxId,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_state) => {
          // Scroll offset will be saved by the UI component
        }
      );
    }

    this.currentMailboxId = mailboxId;
  }

  /**
   * Get current controller state.
   */
  getState(): PaginationControllerState | null {
    if (!this.currentMailboxId) {
      return null;
    }

    const state = getMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      this.options.pageSize
    );

    return {
      mailboxId: this.currentMailboxId,
      ids: [...state.ids],
      itemsById: new Map(state.itemsById),
      loadedCount: state.loadedCount,
      hasMore: state.hasMore,
      loading: state.loading,
      loadingNext: state.loadingNext ?? false,
      error: state.error,
      errorNext: state.errorNext ?? null,
      total: undefined, // Will be computed from queryState if needed
      pendingNewCount: state.pendingNewIds.length,
      canCalculateChanges: state.canCalculateChanges ?? false
    };
  }

  /**
   * Update an item in the store (e.g., after marking read/unread).
   */
  updateItem(emailId: string, updater: (item: JmapEmailSummary) => JmapEmailSummary): void {
    if (!this.currentMailboxId) {
      return;
    }

    updateMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      (state) => {
        const item = state.itemsById.get(emailId);
        if (item) {
          state.itemsById.set(emailId, updater(item));
        }
      }
    );
  }

  /**
   * Remove an item from the list (e.g., after delete/move).
   */
  removeItem(emailId: string): void {
    if (!this.currentMailboxId) {
      return;
    }

    updateMailboxListState(
      this.options.apiUrl,
      this.options.accountId,
      this.currentMailboxId,
      (state) => {
        const index = state.ids.indexOf(emailId);
        if (index >= 0) {
          state.ids.splice(index, 1);
          state.loadedCount = state.ids.length;
        }
        state.itemsById.delete(emailId);
      }
    );
  }

  /**
   * Clear all cached states for the current account.
   */
  clearCache(): void {
    clearMailboxListStatesForAccount(this.options.apiUrl, this.options.accountId);
  }
}

