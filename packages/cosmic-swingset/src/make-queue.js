// @ts-check

/**
 * @typedef {object} QueueStorage
 * @property {() => void} commit
 * @property {() => void} abort
 * @property {(key: string) => string | undefined} get
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} delete
 */

/**
 * Create a queue backed by some sort of scoped storage.
 *
 * The queue writes the following bare keys, and expect any prefixing/scoping
 * to be handled by the storage:
 * - `head`: the index of the first entry of the queue.
 * - `tail`: the index *past* the last entry in the queue.
 * - `<index>`: the contents of the queue at the given index.
 *
 * For the `actionQueue`, the Cosmos side of the queue will push into the queue,
 * updating `<prefix>tail` and `<prefix><index>`.  The JS side will shift the
 * queue, updating `<prefix>head` and reading and deleting `<prefix><index>`.
 *
 * Parallel access is not supported, only a single outstanding operation at a
 * time.
 *
 * @template {unknown} [T=unknown]
 * @param {QueueStorage} storage a scoped queue storage
 */
export const makeQueue = storage => {
  const getHead = () => BigInt(storage.get('head') || 0);
  const getTail = () => BigInt(storage.get('tail') || 0);

  const queue = {
    size: () => {
      return Number(getTail() - getHead());
    },
    /** @param {T} obj */
    push: obj => {
      const tail = getTail();
      storage.set('tail', String(tail + 1n));
      storage.set(`${tail}`, JSON.stringify(obj));
      storage.commit();
    },
    /** @returns {IterableIterator<T>} */
    consumeAll: () => {
      let done = false;
      let head = getHead();
      const tail = getTail();
      const iterator = {
        [Symbol.iterator]: () => iterator,
        next: () => {
          if (!done) {
            if (head < tail) {
              // Still within the queue.
              const headKey = `${head}`;
              const value = JSON.parse(
                /** @type {string} */ (storage.get(headKey)),
              );
              storage.delete(headKey);
              head += 1n;
              return { value, done };
            }
            // Reached the end, so clean up our indices.
            storage.delete('head');
            storage.delete('tail');
            storage.commit();
            done = true;
          }
          return { value: undefined, done };
        },
        return: () => {
          if (!done) {
            // We're done consuming, so save our state.
            storage.set('head', String(head));
            storage.commit();
            done = true;
          }
          return { value: undefined, done };
        },
        throw: err => {
          if (!done) {
            // Don't change our state.
            storage.abort();
            done = true;
            throw err;
          }
          return { value: undefined, done };
        },
      };
      return iterator;
    },
  };
  return queue;
};
harden(makeQueue);
