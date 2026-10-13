/**
 * components/ShareGateMessage.jsx
 *
 * What a share page shows when it cannot show the thing.
 *
 * Three different failures used to render as one line of text, which is how a
 * player ended up looking for a missing map when the real problem was a stale
 * link. They are now told apart, because the right next action differs for
 * each: log in, switch account, or ask the DM.
 *
 * The login route carries where to come back to — see `api/returnTo.js`, which
 * validates it, because that destination arrives in a URL anyone can write.
 */
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui';
import { loginHref } from '@/api/returnTo';

/**
 * @param {number|null} status  HTTP status from `useAsync`'s `errorInfo`
 * @param {string|null} code    the server's machine-readable reason
 * @param {string}      message the server's own sentence, used as the fallback
 * @param {string}      icon    the module's emoji, so the page still feels itself
 */
export default function ShareGateMessage({ status, code, message, icon = '🔗' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;

  const loggedOut = status === 401 || code === 'LOGIN_REQUIRED';
  const notYours = status === 403 || code === 'NOT_YOUR_CAMPAIGN';

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
      <div className="text-4xl" aria-hidden="true">{loggedOut ? '🔒' : icon}</div>

      <p className="text-text-dim text-sm max-w-sm">
        {loggedOut
          ? 'This is shared with the campaign’s players. Log in to see it.'
          : notYours
            ? 'This belongs to a campaign you are not in. If you expected to see it, you may be signed in as the wrong user.'
            : message || 'This link does not work any more — ask your DM for a new one.'}
      </p>

      {loggedOut && (
        <Button variant="accent" onClick={() => navigate(loginHref(here))}>
          Log in
        </Button>
      )}
    </div>
  );
}
