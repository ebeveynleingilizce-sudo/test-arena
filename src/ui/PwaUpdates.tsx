import {useEffect, useState} from 'react';
export function PwaUpdates() {
  const [ready, setReady] = useState<ServiceWorkerRegistration>();
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let alive = true, registration: ServiceWorkerRegistration | undefined;
    const check = () => {if (registration?.waiting && navigator.serviceWorker.controller && alive) setReady(registration);};
    const found = () => {registration?.installing?.addEventListener('statechange', check);};
    const visible = () => {if (document.visibilityState === 'visible') void registration?.update().catch(() => {});};
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`, {scope: import.meta.env.BASE_URL, updateViaCache: 'none'}).then(reg => {
      if (!alive) return;
      registration = reg; check(); reg.addEventListener('updatefound', found);
    }).catch(() => {});
    document.addEventListener('visibilitychange', visible);
    return () => {alive = false; registration?.removeEventListener('updatefound', found); document.removeEventListener('visibilitychange', visible);};
  }, []);
  function refresh() {
    if (!ready?.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
    ready.waiting.postMessage({type: 'SKIP_WAITING'});
  }
  return ready ? <aside className="pwa-update" role="status"><p>Yeni sürüm hazır. Devam eden işlemini tamamladıktan sonra yenileyebilirsin. Kaydedilmiş hesabın ve ilerlemen korunur.</p><button className="button primary" onClick={refresh}>Yeni sürüme geç</button></aside> : null;
}
