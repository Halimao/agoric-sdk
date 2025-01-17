import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { LOCALCHAIN_DEFAULT_ADDRESS } from '@agoric/vats/tools/fake-bridge.js';
import { setUpZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { E } from '@endo/far';
import path from 'path';
import { commonSetup } from '../supports.js';

const dirname = path.dirname(new URL(import.meta.url).pathname);

const contractFile = `${dirname}/../../src/examples/swapExample.contract.js`;
type StartFn =
  typeof import('@agoric/orchestration/src/examples/swapExample.contract.js').start;

// Failing with "guest eventual send not yet supported:"
// in withdrawFromSeat, at
// `return E(tempUserSeatP).getPayouts();`
test.failing('start', async t => {
  const {
    bootstrap,
    brands: { ist },
    commonPrivateArgs,
    utils,
  } = await commonSetup(t);

  const { zoe, bundleAndInstall } = await setUpZoeForTest();
  const installation: Installation<StartFn> =
    await bundleAndInstall(contractFile);

  const { publicFacet } = await E(zoe).startInstance(
    installation,
    { Stable: ist.issuer },
    {},
    commonPrivateArgs,
  );

  const inv = E(publicFacet).makeSwapAndStakeInvitation();

  t.is(
    (await E(zoe).getInvitationDetails(inv)).description,
    'Swap for TIA and stake',
  );

  const bank = await E(bootstrap.bankManager).getBankForAddress(
    LOCALCHAIN_DEFAULT_ADDRESS,
  );

  const istPurse = await E(bank).getPurse(ist.brand);
  // bank purse is empty
  t.like(await E(istPurse).getCurrentAmount(), ist.makeEmpty());

  const ten = ist.units(10);
  const userSeat = await E(zoe).offer(
    inv,
    { give: { Stable: ten } },
    { Stable: await utils.pourPayment(ten) },
    {
      staked: ten,
      validator: {
        chainId: 'agoric-3',
        address: 'agoric1valoperfufu',
        addressEncoding: 'bech32',
      } as const,
    },
  );
  const result = await E(userSeat).getOfferResult();
  t.is(result, undefined);

  // bank purse now has the 10 IST
  t.like(await E(istPurse).getCurrentAmount(), ten);
});
