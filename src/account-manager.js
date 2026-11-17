import { checkRedisConnection, default as redis } from './redis.js';
import { Client, LocalAuth, whatsappClient, whatsappClientOptions } from './whatsapp-web.js';
import QR from 'qr-image';

const accounts = new Map();
const ACCOUNTS_KEY = 'whatsapp:accounts';
let activeAccountId = 'default';
let initialized = false;

function registerClient(id, client, name = id) {
  const account = { id, name, client, qr: null, status: 'initializing', error: null };
  const logMessageEvent = (eventName, message) => {
    if (process.env.DEBUG_WHATSAPP_EVENTS !== 'true') return;
    console.log(JSON.stringify({
      eventName,
      accountId: id,
      from: message.from || null,
      author: message.author || null,
      remote: message.id?.remote || null,
      fromMe: Boolean(message.fromMe),
      body: message.body || ''
    }));
  };
  client.on('message', message => logMessageEvent('message', message));
  client.on('message_create', message => logMessageEvent('message_create', message));
  client.on('qr', qr => { account.qr = QR.imageSync(qr, { type: 'svg' }); account.status = 'qr'; });
  client.on('ready', () => { account.qr = null; account.status = 'ready'; account.error = null; });
  client.on('authenticated', () => { account.status = 'authenticated'; });
  client.on('auth_failure', error => { account.status = 'auth_failure'; account.error = error?.message || 'Authentication failed'; });
  client.on('disconnected', reason => { account.status = 'disconnected'; account.error = reason || null; });
  accounts.set(id, account);
  return account;
}

registerClient('default', whatsappClient, 'Cuenta principal');

function publicAccount(account) {
  return {
    id: account.id, name: account.name, status: account.status, error: account.error,
    phone: account.client.info?.wid?.user || null, active: account.id === activeAccountId,
    hasQr: Boolean(account.qr), qr: account.qr
  };
}

async function persistAccount(account) {
  if (!(await checkRedisConnection())) return;
  await redis.hset(ACCOUNTS_KEY, account.id, JSON.stringify({ id: account.id, name: account.name }));
  await redis.set('whatsapp:active_account', activeAccountId);
}

export async function initializeAccounts() {
  if (initialized) return;
  if (!(await checkRedisConnection())) return;
  initialized = true;
  const saved = await redis.hgetall(ACCOUNTS_KEY);
  const savedActive = await redis.get('whatsapp:active_account');
  for (const [id, raw] of Object.entries(saved)) {
    if (id === 'default' || accounts.has(id)) continue;
    const metadata = JSON.parse(raw);
    const client = new Client({ ...whatsappClientOptions, authStrategy: new LocalAuth({ clientId: `account-${id}` }) });
    const account = registerClient(id, client, metadata.name || id);
    client.initialize().catch(error => { account.status = 'error'; account.error = error.message; });
  }
  if (savedActive && accounts.has(savedActive)) activeAccountId = savedActive;
}

export function getActiveClient() { return accounts.get(activeAccountId)?.client || whatsappClient; }
export function getAccountClient(id) {
  if (!id) return getActiveClient();
  const account = accounts.get(id);
  if (!account) throw new Error('Account not found');
  return account.client;
}
export function listAccounts() { return [...accounts.values()].map(publicAccount); }
export function getAccount(id) { const account = accounts.get(id); return account ? publicAccount(account) : null; }
export function getActiveAccount() { return getAccount(activeAccountId); }
export function getAccountQr(id) { return accounts.get(id)?.qr || null; }

export async function createAccount({ id, name }) {
  if (!id || !/^[a-z0-9-]+$/i.test(id)) throw new Error('Account id must contain only letters, numbers and hyphens');
  if (accounts.has(id)) throw new Error('Account already exists');
  const client = new Client({ ...whatsappClientOptions, authStrategy: new LocalAuth({ clientId: `account-${id}` }) });
  const account = registerClient(id, client, name || id);
  await client.initialize();
  await persistAccount(account);
  return publicAccount(account);
}

export async function switchAccount(id) {
  const target = accounts.get(id);
  if (!target) throw new Error('Account not found');
  if (id === activeAccountId) return publicAccount(target);
  const current = accounts.get(activeAccountId);
  if (current?.client.info) await current.client.destroy().catch(() => {});
  activeAccountId = id;
  if (['disconnected', 'error', 'auth_failure'].includes(target.status)) {
    target.status = 'initializing';
    await target.client.initialize().catch(error => { target.status = 'error'; target.error = error.message; throw error; });
  }
  await persistAccount(target);
  return publicAccount(target);
}
