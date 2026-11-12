import { useEffect, useState } from 'react';

/** Shows when the connection drops, and when a new version has taken over. Both are plain status messages. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const changed = () => { if (hadController) setUpdated(true); hadController = true; };
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); navigator.serviceWorker?.removeEventListener('controllerchange', changed); };
  }, []);
  if (online && !updated) return null;
  return (
    <div role="status" data-testid="offline-banner" className="border-b border-line bg-raised px-5 py-2 text-center text-sm text-fg">
      {!online ? 'You are offline. Tools that were saved for offline use still work. Anything that needs the internet will wait until you are back.' : (
        <>A new version of ToolAtlas is ready. <button type="button" className="text-accent underline" onClick={() => location.reload()}>Reload to use it</button></>
      )}
    </div>
  );
}
