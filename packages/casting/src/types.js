// @ts-check

// Make this a module.
import '@agoric/notifier';

export {};

/** @template T @typedef {import('@endo/far').ERef<T>} ERef */

/**
 * @typedef {object} LeaderOptions
 * @property {null | ((where: string, err: any, attempt?: number) => Promise<void>)} [retryCallback]
 * @property {(where: string) => Promise<void>} [jitter]
 * @property {(where: string) => Promise<boolean>} [keepPolling]
 */

/**
 * @typedef {object} CastingChange
 * @property {number} [blockHeight]
 * @property {Uint8Array[]} values
 */

/**
 * @typedef {object} Leader
 * @property {(where: string, error: any, attempt?: number) => Promise<void>} retry
 * @property {(where: string) => Promise<void>} jitter
 * @property {() => LeaderOptions} getOptions
 * @property {<T>(where: string, callback: (endpoint: string) => Promise<T>) => Promise<T[]>} mapEndpoints
 * @property {(spec: ERef<CastingSpec>) => Promise<Follower<CastingChange>>} watchCasting
 */

/** @typedef {ERef<Leader> | (() => ERef<Leader>)} LeaderOrMaker */

/**
 * @template T
 * @typedef {object} Follower
 * @property {() => Promise<AsyncIterable<T>>} getLatestIterable
 * @property {() => Promise<AsyncIterable<T>>} getEachIterable
 */

/**
 * @template T
 * @typedef {object} FollowerElement
 * @property {T} value
 */

/**
 * @typedef {object} Unserializer
 * @property {(data: import('@endo/marshal').CapData<unknown>) => any} unserialize
 */

/**
 * @typedef {object} Crasher
 * @property {(...args: unknown[]) => void} crash
 */

/**
 * @typedef {object} FollowerOptions
 * @property {null | import('@endo/far').FarRef<Unserializer>} [unserializer]
 * @property {(buf: Uint8Array) => any} [decode]
 * @property {'strict'|'optimistic'|'none'} [proof]
 * @property {import('@endo/far').FarRef<Crasher>} [crasher]
 */

/**
 * @typedef {object} CastingSpec
 * @property {string} [storeName]
 * @property {Uint8Array} [storeSubkey]
 * @property {Uint8Array} [dataPrefixBytes]
 * @property {ERef<Subscription<any>>} [subscription]
 * @property {ERef<Notifier<any>>} [notifier]
 */