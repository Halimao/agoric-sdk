// @ts-check

import { E } from '@agoric/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { Far } from '@endo/marshal';

import { assert } from '@agoric/assert';
import { evalContractBundle } from '../src/contractFacet/evalContractCode.js';
import { handlePKitWarning } from '../src/handleWarning.js';
import { makeHandle } from '../src/makeHandle.js';
import zcfContractBundle from '../bundles/bundle-contractFacet.js';

// this simulates a bundlecap, which is normally a swingset "device node"
/** @typedef { import('@agoric/swingset-vat').BundleCap } BundleCap */
/** @type {BundleCap} */
export const zcfBundleCap = makeHandle('BundleCap');

/**
 * @param { (...args) => unknown } [testContextSetter]
 * @param { (x: unknown) => unknown } [makeRemote]
 */
function makeFakeVatAdmin(testContextSetter = undefined, makeRemote = x => x) {
  // FakeVatPowers isn't intended to support testing of vat termination, it is
  // provided to allow unit testing of contracts that call zcf.shutdown()
  let exitMessage;
  let hasExited = false;
  let exitWithFailure;
  const fakeVatPowers = {
    exitVat: completion => {
      exitMessage = completion;
      hasExited = true;
      exitWithFailure = false;
    },
    exitVatWithFailure: reason => {
      exitMessage = reason;
      hasExited = true;
      exitWithFailure = true;
    },
  };

  // This is explicitly intended to be mutable so that
  // test-only state can be provided from contracts
  // to their tests.
  const admin = Far('vatAdmin', {
    getBundleCap: _bundleID => {
      assert.fail(`fakeVatAdmin.getBundleCap() not yet implemented`);
    },
    getNamedBundleCap: name => {
      assert.equal(name, 'zcf', 'fakeVatAdmin only knows ZCF');
      return zcfBundleCap;
    },
    createVat: bundleCap => {
      assert.equal(bundleCap, zcfBundleCap, 'fakeVatAdmin only knows ZCF');
      const bundle = zcfContractBundle;
      return harden({
        root: makeRemote(
          E(evalContractBundle(bundle)).buildRootObject(
            fakeVatPowers,
            undefined,
            testContextSetter,
          ),
        ),
        adminNode: Far('adminNode', {
          done: () => {
            const kit = makePromiseKit();
            handlePKitWarning(kit);
            return kit.promise;
          },
          terminateWithFailure: () => {},
        }),
      });
    },
  });
  const vatAdminState = {
    getExitMessage: () => exitMessage,
    getHasExited: () => hasExited,
    getExitWithFailure: () => exitWithFailure,
  };
  return { admin, vatAdminState };
}

const fakeVatAdmin = makeFakeVatAdmin().admin;

export default fakeVatAdmin;
export { makeFakeVatAdmin };
