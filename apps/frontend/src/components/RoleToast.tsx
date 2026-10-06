import { useEffect, useState } from 'react';
import { ReadOnlyRoleError } from '../services/syncTracking.js';

/**
 * Role rules are enforced when a change is saved. If a screen tries to save something the signed-in role may not
 * change (for example a viewer tapping "mark absent"), the save is refused and this note explains why.
 */
export default function RoleToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof ReadOnlyRoleError) {
        e.preventDefault();
        setMessage(e.reason.message);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setMessage(null), 5000);
      }
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-md bg-slate-900 text-white text-sm px-4 py-2 shadow-lg no-print">{message} Nothing was saved.</div>;
}
