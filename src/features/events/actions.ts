import { ValidationError } from '@/data';
import type { EventOp, Store, UndoToken } from '@/data';

/** The ways a write can end. The UI shows a different message for each and never loses the form. */
export type Outcome =
  | { status: 'ok'; undo: UndoToken }
  /** Another tab changed the same event since the form opened. */
  | { status: 'conflict' }
  /** The event was deleted elsewhere. */
  | { status: 'not-found' }
  /** The model refused the values (the form should have caught it first). */
  | { status: 'invalid' }
  /** The browser could not write (storage full, blocked, closed). */
  | { status: 'failed' };

export async function execute(store: Pick<Store, 'applyOps'>, ops: readonly EventOp[]): Promise<Outcome> {
  try {
    const result = await store.applyOps(ops);
    if (result.status === 'ok') return { status: 'ok', undo: result.undo };
    return { status: result.status };
  } catch (error) {
    return { status: error instanceof ValidationError ? 'invalid' : 'failed' };
  }
}

/** Takes a batch back. Resolves false when nothing could be restored or storage failed. */
export async function undoBatch(store: Pick<Store, 'undo'>, token: UndoToken): Promise<boolean> {
  try {
    return await store.undo(token);
  } catch {
    return false;
  }
}
