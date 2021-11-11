import Offer from './Offer';
import Payment from './Payment';
import DappConnection from './DappConnection';
import { withApplicationContext } from '../contexts/Application';

import './Requests.scss';

// Exported for testing only.
const RequestsInternal = ({ payments, offers, dapps, purses }) => {
  const hasNoAutodeposit = payment =>
    !purses.filter(
      p => p.brand === payment.brand && (p.depositBoardId || '').length,
    ).length;

  const isDisabled = dapp => !dapp.enable;

  payments = (payments || [])
    .filter(hasNoAutodeposit)
    .map(p => ({ type: 'payment', data: p }));

  offers = (offers || []).map(o => ({
    type: 'offer',
    data: o,
  }));

  dapps = (dapps || []).filter(isDisabled).map(d => ({
    type: 'dapp',
    data: d,
  }));

  const requests = [...payments, ...offers, ...dapps].sort(
    (a, b) => a.data.id - b.data.id,
  );

  const Item = request => {
    if (request.type === 'offer') {
      return <Offer offer={request.data} key={request.data.id} />;
    } else if (request.type === 'payment') {
      return <Payment key={request.data.id} />;
    } else {
      return <DappConnection key={request.data.id} />;
    }
  };
  return (
    <div className="Requests">
      {requests.length ? (
        requests.map(Item)
      ) : (
        <div className="Empty">
          <img
            className="Splash-image"
            src="agoric-city.svg"
            alt="Empty Inbox"
            width="320"
            height="320"
          />
          <p className="text-gray">No requests.</p>
        </div>
      )}
    </div>
  );
};

export default withApplicationContext(RequestsInternal, context => ({
  payments: context.payments,
  offers: context.inbox,
  dapps: context.dapps,
  purses: context.purses,
}));
