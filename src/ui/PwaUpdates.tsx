import {useEffect, useRef, useState} from 'react';
export function PwaUpdates() {
  const [ready, setReady] = useState<ServiceWorkerRegistration>();
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready');
  const busy = useRef(false);
  const cleanup = useRef<() => void>(() => {});
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
    return () => {alive = false; cleanup.current(); registration?.removeEventListener('updatefound', found); document.removeEventListener('visibilitychange', visible);};
  }, []);
  function refresh() {
    if (busy.current || !ready) return;
    busy.current = true;
    setStatus('loading');
    const worker = ready.waiting;
    const fail = () => {cleanup.current(); busy.current = false; setStatus('error');};
    const changed = () => {cleanup.current(); location.reload();};
    const stateChanged = () => {if (worker?.state === 'redundant') fail();};
    // A deadline detects an unresponsive worker; successful updates reload immediately.
    const deadline = window.setTimeout(fail, 30000);
    cleanup.current = () => {
      window.clearTimeout(deadline);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      worker?.removeEventListener('statechange', stateChanged);
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    worker?.addEventListener('statechange', stateChanged);
    try {
      if (!worker) {fail(); return;}
      worker.postMessage({type: 'SKIP_WAITING'});
    } catch {fail();}
  }
  return ready ? <aside className="pwa-update" role="status" aria-live="polite" aria-busy={status === 'loading'}>
    <p>{status === 'error' ? 'Güncelleme başarısız oldu. Tekrar dene.' : 'Yeni sürüm hazır. Devam eden işlemini tamamladıktan sonra yenileyebilirsin. Kaydedilmiş hesabın ve ilerlemen korunur.'}</p>
    <button className="button primary" disabled={status === 'loading'} onClick={refresh}>
      {status === 'loading' && <span className="pwa-update-spinner" aria-hidden="true" />}
      {status === 'loading' ? 'Yeni sürüm yükleniyor...' : status === 'error' ? 'Tekrar dene' : 'Yeni sürüme geç'}
    </button>
  </aside> : null;
}
