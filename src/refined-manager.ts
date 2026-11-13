/**
 * Refined turn orchestrator.
 *
 * Delegates extraction, storage, and row mapping to focused modules under
 * src/refine/. This file keeps the original public API and owns cross-cutting
 * concerns such as the write mutex.
 */

import path from 'path';
import { Mutex } from './utils/mutex.js';
import { RefinedStore } from './refine/store.js';
import { extract } from './refine/extractor.js';
import type {
  RawTurn,
  RefinedTurn,
  RefinedSearchOptions,
  RefinedSearchMatch,
} from './refine/types.js';

export {
  type RawAction,
  type RawTurn,
  type RefinedTurn,
  type RefinedSearchOptions,
  type RefinedSearchMatch,
} from './refine/types.js';

export class RefinedManager {
  refinedRoot: string;
  private store: RefinedStore | undefined;
  private mutex: Mutex;
  private initError: Error | undefined;

  constructor(refinedRoot: string) {
    this.refinedRoot = refinedRoot;
    this.mutex = new Mutex();
    try {
      this.store = new RefinedStore(refinedRoot);
    } catch (error) {
      // A storage failure must not take down the MCP server: the other 21
      // tools (memory CRUD, search, session context) do not need this store.
      this.initError = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(
        `[kimi-memory] refined store unavailable, continuing without it: ${this.initError.message}\n`,
      );
    }
  }

  /** True when the refined-turn database opened successfully. */
  isAvailable(): boolean {
    return this.store !== undefined;
  }

  private requireStore(): RefinedStore {
    if (this.store !== undefined) return this.store;
    throw new Error(
      `Refined store unavailable: ${this.initError?.message ?? 'initialization failed'}`,
    );
  }

  refineTurn(turn: RawTurn, sessionId: string): RefinedTurn {
    return extract(turn, sessionId);
  }

  async saveRefinedTurns(sessionId: string, refinedTurns: RefinedTurn[]): Promise<void> {
    const store = this.requireStore();
    return this.mutex.runExclusive(() => {
      store.saveRefinedTurns(sessionId, refinedTurns);
    });
  }

  loadRefinedTurns(sessionId: string): RefinedTurn[] {
    return this.requireStore().loadRefinedTurns(sessionId);
  }

  loadRefinedTurn(sessionId: string, turnId: number): RefinedTurn | undefined {
    return this.requireStore().loadRefinedTurn(sessionId, turnId);
  }

  getDbPath(): string {
    return this.store?.getDbPath() ?? path.join(this.refinedRoot, 'refined.sqlite');
  }

  searchRefinedTurns(options: RefinedSearchOptions): RefinedSearchMatch[] {
    return this.requireStore().searchRefinedTurns(options);
  }

  countAll(): number {
    return this.requireStore().countAll();
  }

  listRecentTurns(limit: number): RefinedTurn[] {
    return this.requireStore().listRecentTurns(limit);
  }

  async deleteRefinedTurns(refs: Array<{ sessionId: string; turnId: number }>): Promise<number> {
    const store = this.requireStore();
    return this.mutex.runExclusive(() => {
      return store.deleteRefinedTurns(refs);
    });
  }

  close(): void {
    this.store?.close();
  }
}
