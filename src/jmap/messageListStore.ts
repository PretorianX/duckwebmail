/**
 * Mailbox-scoped message list state store with LRU cache.
 * Maintains ordered IDs, item details, pagination state, and UI helpers.
 */

import type { JmapEmailSummary } from "./email";

export interface MailboxListState {
  mailboxId: string;
  queryState?: string;
  ids: string[];
  itemsById: Map<string, JmapEmailSummary>;
  loadedCount: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  lastRefreshAt: number;
  canCalculateChanges?: boolean;
  pendingNewIds: string[];
  scrollOffset: number;
  selectedId: string | null;
}

const MAX_CACHED_MAILBOXES = 10;
const storeCache = new Map<string, MailboxListState>();
const accessOrder: string[] = [];

function getCacheKey(apiUrl: string, accountId: string, mailboxId: string): string {
  return `${apiUrl}|${accountId}|${mailboxId}`;
}

function touchCacheKey(key: string): void {
  const index = accessOrder.indexOf(key);
  if (index >= 0) {
    accessOrder.splice(index, 1);
  }
  accessOrder.push(key);
}

function evictLRU(): void {
  if (accessOrder.length >= MAX_CACHED_MAILBOXES) {
    const oldestKey = accessOrder.shift();
    if (oldestKey) {
      storeCache.delete(oldestKey);
    }
  }
}

/**
 * Get or create mailbox list state for a given mailbox.
 * Implements LRU eviction when cache is full.
 */
export function getMailboxListState(
  apiUrl: string,
  accountId: string,
  mailboxId: string,
  pageSize: number
): MailboxListState {
  const key = getCacheKey(apiUrl, accountId, mailboxId);
  touchCacheKey(key);

  let state = storeCache.get(key);
  if (!state) {
    evictLRU();
    state = {
      mailboxId,
      queryState: undefined,
      ids: [],
      itemsById: new Map(),
      loadedCount: 0,
      pageSize,
      hasMore: true,
      loading: false,
      error: null,
      lastRefreshAt: 0,
      canCalculateChanges: undefined,
      pendingNewIds: [],
      scrollOffset: 0,
      selectedId: null
    };
    storeCache.set(key, state);
  } else if (state.pageSize !== pageSize) {
    // Update page size if changed
    state.pageSize = pageSize;
  }

  return state;
}

/**
 * Update mailbox list state.
 */
export function updateMailboxListState(
  apiUrl: string,
  accountId: string,
  mailboxId: string,
  updater: (state: MailboxListState) => void
): void {
  const key = getCacheKey(apiUrl, accountId, mailboxId);
  const state = storeCache.get(key);
  if (state) {
    touchCacheKey(key);
    updater(state);
  }
}

/**
 * Remove mailbox list state from cache.
 */
export function removeMailboxListState(apiUrl: string, accountId: string, mailboxId: string): void {
  const key = getCacheKey(apiUrl, accountId, mailboxId);
  storeCache.delete(key);
  const index = accessOrder.indexOf(key);
  if (index >= 0) {
    accessOrder.splice(index, 1);
  }
}

/**
 * Clear all cached mailbox list states for a specific account.
 */
export function clearMailboxListStatesForAccount(apiUrl: string, accountId: string): void {
  const prefix = `${apiUrl}|${accountId}|`;
  const keysToDelete: string[] = [];
  for (const key of storeCache.keys()) {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    storeCache.delete(key);
    const index = accessOrder.indexOf(key);
    if (index >= 0) {
      accessOrder.splice(index, 1);
    }
  }
}

/**
 * Clear all cached mailbox list states.
 */
export function clearAllMailboxListStates(): void {
  storeCache.clear();
  accessOrder.length = 0;
}

