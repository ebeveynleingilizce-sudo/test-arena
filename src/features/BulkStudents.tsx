import { useState, type FormEvent } from 'react';
import { call } from '../data/firebase';
import { errorMessage } from '../ui/components';
import type { ArenaClass } from '../domain/models';

type Result = { name: string; studentId?: string; code?: string; error?: string };
export function BulkStudents({ cls, close, completed }: { cls: ArenaClass; close: () => void; completed: () => void }) {
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [results, setResults] = useState<Result[] | null>(null), [requestId, setRequestId] = useState(() => crypto.randomUUID()), [locked, setLocked] = useState(false);
  const names = input.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!names.length || names.length > 50) { setError('Bir işlemde 1–50 öğrenci eklenebilir.'); return; }
    setBusy(true); setLocked(true); setError(''); setNotice('');
    try {
      const response = await call<{results: Result[]}>('bulkCreateStudents', { classId: cls.classId, names, requestId });
      setResults(response.results); completed();
    } catch (e) { setError(errorMessage(e) + ' Sonuç alınamadı; aynı listeyle yeniden denemek çift kayıt oluşturmaz.'); }
    finally { setBusy(false); }
  }
  const successful = results?.filter(r => r.code) || [];
  return <div className="modal-backdrop"><section className="modal bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
    <button className="modal-close" aria-label="Kapat" disabled={busy} onClick={close}>×</button>
    <span className="eyebrow">SINIF YÖNETİMİ</span><h2 id="bulk-title">Toplu öğrenci ekle</h2>
    <p>{cls.className} · {cls.defaultGradeLevel}. Sınıf varsayılanı</p>
    {!results ? <form onSubmit={submit}><label>Öğrenci adları<textarea autoFocus rows={9} value={input} disabled={locked} onChange={e => { setInput(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder={'Mehmet Kayra Aşık\nAli Ak\nEzgi Gür\nAyşe Yılmaz'}/></label>
      <p className="field-hint">Her dolu satır bir öğrenci. Boş satırlar yok sayılır; aynı isimler ayrı kayıtlardır. En fazla 50 öğrenci. Tam ad en fazla 80 karakter; ad ve soyad alanları en fazla 40 karakter.</p>
      <p className="bulk-count" role="status">{names.length} / 50 öğrenci</p>
      <button className="button primary" disabled={busy || !names.length || names.length > 50}>{busy ? 'Öğrenciler ekleniyor…' : locked ? 'Aynı işlemi yeniden dene' : 'Öğrencileri ekle'}</button>
    </form> : <><p role="status">{successful.length} öğrenci eklendi · {results.length - successful.length} öğrenci eklenemedi</p>
      <table className="bulk-results"><thead><tr><th>Öğrenci</th><th>Kısa Kod</th></tr></thead><tbody>{results.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.code ? <b>{r.code}</b> : <span className="bulk-failure">Eklenemedi: {r.error}</span>}</td></tr>)}</tbody></table>
      <button className="button primary" disabled={!successful.length} onClick={() => { void navigator.clipboard.writeText(successful.map(r => `${r.name} — ${r.code}`).join('\n')).then(() => setNotice('Kodlar kopyalandı.')).catch(() => setError('Kodlar kopyalanamadı.')); }}>Kodları Kopyala</button>
    </>}
    <p role="alert" className="error-message">{error}</p><p role="status" className="status-message">{notice}</p>
  </section></div>;
}
