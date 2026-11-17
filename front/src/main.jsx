import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const STATUS_LABELS = {
  ready: 'Conectada',
  qr: 'Esperando escaneo',
  initializing: 'Iniciando…',
  authenticated: 'Autenticando…',
  disconnected: 'Desconectada',
  auth_failure: 'Falló la autenticación',
  error: 'Error'
};

const statusLabel = account => STATUS_LABELS[account.status] || account.status;

function App() {
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [accountForm, setAccountForm] = useState({ id: '', name: '' });
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadVersion = useRef(0);

  const load = async () => {
    const requestVersion = ++loadVersion.current;
    const data = await api('/accounts');
    if (requestVersion !== loadVersion.current) return;
    setAccounts(data.accounts);
    setActiveId(data.active?.id || null);
    setSelectedId(current => {
      if (current && data.accounts.some(account => account.id === current)) return current;
      return data.active?.id || data.accounts[0]?.id || null;
    });
  };

  useEffect(() => { load().catch(err => setError(err.message)); }, []);
  useEffect(() => {
    const timer = setInterval(() => load().catch(err => setError(err.message)), 4000);
    return () => clearInterval(timer);
  }, []);

  const active = accounts.find(account => account.id === activeId) || null;
  const selected = accounts.find(account => account.id === selectedId) || active;

  const submitAccount = async event => {
    event.preventDefault();
    setError(''); setNotice('');
    try {
      await api('/accounts', { method: 'POST', body: JSON.stringify(accountForm) });
      setAccountForm({ id: '', name: '' });
      setNotice('Cuenta creada. El QR aparece aquí en cuanto WhatsApp lo genere.');
      await load();
    } catch (err) { setError(err.message); }
  };

  const activate = async id => {
    setBusyId(id); setError(''); setNotice('');
    try {
      await api(`/accounts/${id}/activate`, { method: 'POST' });
      setSelectedId(id);
      setNotice('Número activo actualizado. Los envíos saldrán desde este número.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  };

  const selectedHint = !selected
    ? 'Iniciando sesión…'
    : selected.qr
      ? 'Escanea este código con WhatsApp para vincular el número.'
      : selected.phone
        ? `Vinculado como +${selected.phone}`
        : statusLabel(selected);

  return <main>
    <header className="topbar">
      <div><span className="kicker">CONTROL ROOM / WHATSAPP</span><h1>Números vinculados</h1></div>
      <div className={active?.phone ? 'connection online' : 'connection'}><i />{active?.phone || 'Sin número activo'}<small>{active ? statusLabel(active) : 'offline'}</small></div>
    </header>
    {(error || notice) && <div className={error ? 'alert error' : 'alert'}>{error || notice}</div>}
    <section className="grid accounts">
      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">01 / IDENTITY</span><h2>Cuentas</h2></div><span className="count">{accounts.length}</span></div>
        <div className="account-list">
          {accounts.length === 0 && <p className="empty">Todavía no hay números. Crea el primero abajo.</p>}
          {accounts.map(account => <div className={`account ${account.id === selected?.id ? 'selected' : ''}`} key={account.id}>
            <button className="account-main" onClick={() => setSelectedId(account.id)}>
              <span className="avatar">{account.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{account.name}</strong><small>{account.phone || statusLabel(account)}</small></span>
            </button>
            {account.id === activeId
              ? <em>ACTIVA</em>
              : <button className="ghost" disabled={busyId === account.id} onClick={() => activate(account.id)}>{busyId === account.id ? '…' : 'Usar'}</button>}
          </div>)}
        </div>
        <form className="inline-form" onSubmit={submitAccount}>
          <input placeholder="id-cuenta" value={accountForm.id} onChange={event => setAccountForm({ ...accountForm, id: event.target.value })} />
          <input placeholder="Nombre visible" value={accountForm.name} onChange={event => setAccountForm({ ...accountForm, name: event.target.value })} />
          <button className="dark">+ Añadir</button>
        </form>
        <p className="hint">El id solo admite letras, números y guiones. La sesión queda guardada en <code>.wwebjs_auth/session-&lt;id&gt;</code>.</p>
      </article>
      <article className="panel status-panel">
        <span className="eyebrow">SESSION STATUS</span>
        {selected?.qr
          ? <div className="qr" dangerouslySetInnerHTML={{ __html: selected.qr }} />
          : <div className={selected?.phone ? 'status-ring ready' : 'status-ring'}>{selected?.phone ? 'OK' : '--'}</div>}
        <h2>{selected?.name || 'Inicializando sesión'}</h2>
        <p>{selectedHint}</p>
        {selected?.error && <p className="status-error">{selected.error}</p>}
        {selected && selected.id !== activeId && <button className="dark wide" disabled={busyId === selected.id} onClick={() => activate(selected.id)}>{busyId === selected.id ? 'Activando…' : 'Usar este número para enviar'}</button>}
      </article>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
