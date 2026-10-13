/**
 * hooks/useAsync.js
 *
 * A general-purpose hook for async data fetching.
 *
 * @example
 *   const { data, loading, error, errorInfo, run } = useAsync(campaignsApi.list);
 *   // data is null until run() is called or autoRun fires
 *
 * `error` stays a STRING, because every caller renders it straight into JSX
 * and an object there throws. The status and code that `api/client.js` attaches
 * to the thrown Error come back separately in `errorInfo`, for the handful of
 * pages that need to tell a 401 from a 404 — the share pages have to decide
 * between offering a login and reporting a dead link.
 *
 * @param {Function} asyncFn  - The async function to call
 * @param {Object}   opts
 * @param {boolean}  opts.autoRun  - If true, calls asyncFn immediately on mount (default false)
 * @param {any[]}    opts.deps     - Dependency array for autoRun re-trigger
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(asyncFn, { autoRun = false, deps = [] } = {}) {
  // undefined (not null) so that destructuring defaults like `data: x = []` work correctly.
  // null would bypass the default assignment in JS destructuring.
  const [data, setData] = useState(undefined);
  const [loading, setLoading] = useState(autoRun);
  const [error, setError] = useState(null);
  // { status, code } | null — never rendered directly, only branched on.
  const [errorInfo, setErrorInfo] = useState(null);

  // Prevent state updates on unmounted component
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (...args) => {
    if (!mounted.current) return;
    setLoading(true);
    setError(null);
    setErrorInfo(null);
    try {
      const result = await asyncFn(...args);
      if (mounted.current) setData(result);
      return result;
    } catch (e) {
      if (mounted.current) {
        setError(e.message ?? String(e));
        setErrorInfo({ status: e?.status ?? null, code: e?.code ?? null });
      }
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [asyncFn]);

  // Auto-run on mount / when deps change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoRun) run(); }, deps);

  return { data, loading, error, errorInfo, run, setData };
}
