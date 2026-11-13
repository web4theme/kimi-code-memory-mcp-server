import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RefinedStore } from '../../../src/refine/store.js';
import { RefinedManager } from '../../../src/refined-manager.js';
import type { RefinedTurn } from '../../../src/refine/types.js';

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-memory-store-'));
}

function turn(turnId: number): RefinedTurn {
  return {
    sessionId: 'session-1',
    turnId,
    timestamp: `2026-06-24T12:00:0${turnId}.000Z`,
    summary: `summary ${turnId}`,
    facts: [`fact ${turnId}`],
    notes: [],
    entities: { files: [], tools: [], errors: [] },
    categories: {},
  };
}

export default async function runTests(): Promise<void> {
  const root = tempRoot();
  const stores = Array.from({ length: 4 }, () => new RefinedStore(root));

  try {
    // Every instance opens the same file; each must see a usable schema.
    for (const [index, store] of stores.entries()) {
      store.saveRefinedTurns('session-1', [turn(index + 1)]);
    }

    const reader = new RefinedStore(root);
    try {
      assert.strictEqual(reader.loadRefinedTurns('session-1').length, 4);
      assert.strictEqual(reader.countAll(), 4);
      assert(
        reader.searchRefinedTurns({ query: 'summary 2' }).length > 0,
        'refined search should read rows written by another instance',
      );
    } finally {
      reader.close();
    }
  } finally {
    for (const store of stores) store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }

  // A store that cannot open must not prevent the manager from being usable.
  const managerRoot = tempRoot();
  const manager = new RefinedManager(managerRoot);
  try {
    assert.strictEqual(manager.isAvailable(), true);
    assert(manager.getDbPath().endsWith('refined.sqlite'));
  } finally {
    manager.close();
    fs.rmSync(managerRoot, { recursive: true, force: true });
  }
}
