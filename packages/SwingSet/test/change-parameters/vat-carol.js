import { Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    doSomething() {},
  });
}
