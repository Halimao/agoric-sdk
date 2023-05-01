// eslint-disable-next-line import/no-extraneous-dependencies
import bundleSource from '@endo/bundle-source';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { makePromiseKit } from '@endo/promise-kit';
import styles from 'ansi-styles'; // less authority than 'chalk'

const { quote: q, Fail } = assert;

/**
 * @typedef {object} BundleMeta
 * @property {string} bundleFileName
 * @property {string} bundleTime as ISO string
 * @property {{relative: string, absolute: string}} moduleSource
 * @property {Array<{relativePath: string, mtime: string}>} contents
 */

export const makeFileReader = (fileName, { fs, path }) => {
  const make = there => makeFileReader(there, { fs, path });
  return harden({
    toString: () => fileName,
    readText: () => fs.promises.readFile(fileName, 'utf-8'),
    neighbor: ref => make(path.resolve(fileName, ref)),
    stat: () => fs.promises.stat(fileName),
    absolute: () => path.normalize(fileName),
    relative: there => path.relative(fileName, there),
    exists: () => fs.existsSync(fileName),
  });
};

/**
 * @param {string} fileName
 * @param {{ fs: import('fs'), path: import('path') }} io
 */
export const makeFileWriter = (fileName, { fs, path }) => {
  const make = there => makeFileWriter(there, { fs, path });
  return harden({
    toString: () => fileName,
    writeText: txt => fs.promises.writeFile(fileName, txt),
    readOnly: () => makeFileReader(fileName, { fs, path }),
    neighbor: ref => make(path.resolve(fileName, ref)),
    mkdir: opts => fs.promises.mkdir(fileName, opts),
  });
};

/** @type {(n: string) => string} */
const toBundleName = n => `bundle-${n}.js`;
/** @type {(n: string) => string} */
const toBundleMeta = n => `bundle-${n}-meta.json`;

/** @type {Map<string, Promise<*>>} */
const providedCaches = new Map();

/**
 *
 * @param {ReturnType<typeof makeFileWriter>} wr
 * @param {*} bundleOptions
 * @param {ReturnType<typeof makeFileReader>} cwd
 * @param {*} readPowers
 */
export const makeBundleCache = (wr, bundleOptions, cwd, readPowers) => {
  const dimLog = (...args) =>
    console.log(
      `${styles.dim.open}[bundleTool] ${[...args].join(' ')}${
        styles.dim.close
      }`,
    );

  const add = async (rootPath, targetName) => {
    const srcRd = cwd.neighbor(rootPath);

    const modTimeByPath = new Map();

    const loggedRead = async loc => {
      if (!loc.match(/\bpackage.json$/)) {
        try {
          const itemRd = cwd.neighbor(new URL(loc).pathname);
          const ref = srcRd.relative(itemRd.absolute());
          const { mtime } = await itemRd.stat();
          modTimeByPath.set(ref, mtime);
          // console.log({ loc, mtime, ref });
        } catch (oops) {
          console.error(oops);
        }
      }
      return readPowers.read(loc);
    };
    const bundle = await bundleSource(rootPath, bundleOptions, {
      ...readPowers,
      read: loggedRead,
    });

    const { moduleFormat } = bundle;
    assert.equal(moduleFormat, 'endoZipBase64');

    const code = `export default ${JSON.stringify(bundle)};`;
    await wr.mkdir({ recursive: true });
    const bundleFileName = toBundleName(targetName);
    const bundleWr = wr.neighbor(bundleFileName);
    await bundleWr.writeText(code);
    const { mtime: bundleTime } = await bundleWr.readOnly().stat();

    /** @type {BundleMeta} */
    const meta = {
      bundleFileName,
      bundleTime: bundleTime.toISOString(),
      moduleSource: {
        relative: bundleWr.readOnly().relative(srcRd.absolute()),
        absolute: srcRd.absolute(),
      },
      contents: [...modTimeByPath.entries()].map(([relativePath, mtime]) => ({
        relativePath,
        mtime: mtime.toISOString(),
      })),
    };

    await wr
      .neighbor(toBundleMeta(targetName))
      .writeText(JSON.stringify(meta, null, 2));
    return meta;
  };

  const validate = async (targetName, rootOpt) => {
    const metaRd = wr.readOnly().neighbor(toBundleMeta(targetName));
    let txt;
    try {
      txt = await metaRd.readText();
    } catch (ioErr) {
      Fail`${q(targetName)}: cannot read bundle metadata: ${q(ioErr)}`;
    }
    const meta = JSON.parse(txt);
    const {
      bundleFileName,
      bundleTime,
      contents,
      moduleSource: { absolute: moduleSource },
    } = meta;
    assert.equal(bundleFileName, toBundleName(targetName));
    if (rootOpt) {
      moduleSource === cwd.neighbor(rootOpt).absolute() ||
        Fail`bundle ${targetName} was for ${moduleSource}, not ${rootOpt}`;
    }
    const { mtime: actualBundleTime } = await wr
      .readOnly()
      .neighbor(bundleFileName)
      .stat();
    assert.equal(actualBundleTime.toISOString(), bundleTime);
    const moduleRd = wr.readOnly().neighbor(moduleSource);
    const actualTimes = await Promise.all(
      contents.map(async ({ relativePath }) => {
        const itemRd = moduleRd.neighbor(relativePath);
        const { mtime } = await itemRd.stat();
        return { relativePath, mtime: mtime.toISOString() };
      }),
    );
    const outOfDate = actualTimes.filter(({ mtime }) => mtime > bundleTime);
    outOfDate.length === 0 ||
      Fail`out of date: ${q(outOfDate)}. ${q(targetName)} bundled at ${q(
        bundleTime,
      )}`;
    return meta;
  };

  /**
   *
   * @param {string} rootPath
   * @param {string} targetName
   * @returns {Promise<BundleMeta>}
   */
  const validateOrAdd = async (rootPath, targetName) => {
    let meta;
    if (wr.readOnly().neighbor(toBundleMeta(targetName)).exists()) {
      try {
        meta = await validate(targetName, rootPath);
      } catch (invalid) {
        dimLog(invalid.message);
      }
    }
    if (!meta) {
      dimLog(`${wr}`, 'add:', targetName, 'from', rootPath);
      meta = await add(rootPath, targetName);
    }
    return meta;
  };

  const loaded = new Map();
  /**
   * @param {string} rootPath
   * @param {string} [targetName]
   */
  const load = async (
    rootPath,
    targetName = readPowers.basename(rootPath, '.js'),
  ) => {
    const found = loaded.get(targetName);
    // console.log('load', { targetName, found: !!found, rootPath });
    if (found && found.rootPath === rootPath) {
      return found.bundle;
    }
    const todo = makePromiseKit();
    loaded.set(targetName, { rootPath, bundle: todo.promise });
    const bundle = await validateOrAdd(rootPath, targetName)
      .then(({ bundleFileName }) =>
        import(`${wr.readOnly().neighbor(bundleFileName)}`),
      )
      .then(m => harden(m.default));
    assert.equal(bundle.moduleFormat, 'endoZipBase64');
    todo.resolve(bundle);
    return bundle;
  };

  return harden({
    add,
    validate,
    validateOrAdd,
    load,
  });
};

/**
 * Make a new bundle cache for the destination. If there is already one for that destination, error.
 *
 * @param {string} dest
 * @param {{ format?: string, dev?: boolean }} options
 * @param {(id: string) => Promise<any>} loadModule
 */
export const makeNodeBundleCache = async (dest, options, loadModule) => {
  const [fs, path, url, crypto] = await Promise.all([
    await loadModule('fs'),
    await loadModule('path'),
    await loadModule('url'),
    await loadModule('crypto'),
  ]);

  const readPowers = {
    ...makeReadPowers({ fs, url, crypto }),
    basename: path.basename,
  };

  const cwd = makeFileReader('', { fs, path });
  const destWr = makeFileWriter(dest, { fs, path });
  return makeBundleCache(destWr, options, cwd, readPowers);
};

/**
 * Make a new bundle cache for the destination. If there is already one for that destination, error.
 *
 * @param {string} dest
 * @param {{ format?: string, dev?: boolean }} options
 * @param {(id: string) => Promise<any>} loadModule
 */
export const provideBundleCache = (dest, options, loadModule) => {
  const uniqueDest = [dest, options.format, options.dev].join('-');
  if (!providedCaches.has(uniqueDest)) {
    providedCaches.set(
      uniqueDest,
      makeNodeBundleCache(dest, options, loadModule),
    );
  }
  return providedCaches.get(uniqueDest);
};
harden(provideBundleCache);

export const unsafeMakeBundleCache = dest =>
  makeNodeBundleCache(dest, {}, s => import(s));
