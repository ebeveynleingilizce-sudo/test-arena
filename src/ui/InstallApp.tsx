import {useRef, useState, useSyncExternalStore} from 'react';
import {installSnapshot, subscribeInstall, requestInstall, installInstructions} from '../app/pwa';
export function InstallApp() {
  const state = useSyncExternalStore(subscribeInstall, installSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const instructions = installInstructions();
  async function install() {
    if (!state.prompt) {dialog.current?.showModal(); return;}
    setBusy(true); setError('');
    try {await requestInstall();} catch {setError('Kurulum penceresi açılamadı. Tarayıcı menüsünden yükleme seçeneğini kontrol et.');}
    finally {setBusy(false);}
  }
  if (state.installed) return null;
  return <div className="pwa-install"><button className="button outline" disabled={busy} onClick={() => void install()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>{busy ? 'Kurulum açılıyor…' : 'Uygulamayı İndir'}</button>{error && <p role="alert">{error}</p>}<dialog ref={dialog} className="pwa-install-dialog" aria-labelledby="pwa-install-title"><button className="pwa-close" aria-label="Kurulum yönergesini kapat" onClick={() => dialog.current?.close()}>×</button><span className="eyebrow">TEST ARENA</span><h2 id="pwa-install-title">{instructions.title}</h2><ol>{instructions.steps.map(step => <li key={step}>{step}</li>)}</ol><p>{instructions.note}</p><button className="button primary" onClick={() => dialog.current?.close()}>Tamam</button></dialog></div>;
}
