import crypto from 'node:crypto';
import wp from 'whatsapp-web.js';
import { getActiveClient } from './account-manager.js';
import { checkRedisConnection, default as redis } from './redis.js';
import { parseContactsCsv, parseManualContacts, splitContacts } from './csv.js';

const { MessageMedia } = wp;

const campaigns = new Map();
const timers = new Map();
const CAMPAIGNS_KEY = 'whatsapp:campaigns';
let initialized = false;

function nextDelay(campaign) {
  if (campaign.strategy === 'random') return 15000 + Math.floor(Math.random() * 55001);
  return Math.max(1000, Number(campaign.intervalSeconds || 2) * 1000);
}

function publicCampaign(campaign) {
  return {
    ...campaign,
    image: campaign.image ? { filename: campaign.image.filename, mimetype: campaign.image.mimetype } : null,
    contacts: undefined,
    batches: campaign.batches.map(batch => ({
      id: batch.id,
      size: batch.contacts.length,
      sent: batch.contacts.filter(contact => contact.status === 'sent').length,
      failed: batch.contacts.filter(contact => contact.status === 'failed').length,
      status: batch.status
    }))
  };
}

async function persistCampaign(campaign) {
  if (await checkRedisConnection()) await redis.hset(CAMPAIGNS_KEY, campaign.id, JSON.stringify(campaign));
}

export async function initializeCampaigns() {
  if (initialized) return;
  if (!(await checkRedisConnection())) return;
  initialized = true;
  const saved = await redis.hgetall(CAMPAIGNS_KEY);
  for (const raw of Object.values(saved)) {
    const campaign = JSON.parse(raw);
    campaigns.set(campaign.id, campaign);
    for (const batch of campaign.batches) {
      batch.contacts.filter(contact => contact.status === 'sending').forEach(contact => { contact.status = 'pending'; });
    }
    if (campaign.status === 'running') {
      const delay = Math.max(0, new Date(campaign.nextSendAt || Date.now()).getTime() - Date.now());
      timers.set(campaign.id, setTimeout(() => sendNext(campaign), delay));
    }
  }
}

async function sendNext(campaign) {
  if (campaign.status !== 'running') return;
  const batch = campaign.batches.find(item => item.id === campaign.activeBatchId);
  const contact = batch?.contacts.find(item => item.status === 'pending');
  if (!contact) {
    if (batch) batch.status = 'completed';
    if (campaign.batches.some(item => item.contacts.some(contactItem => contactItem.status === 'pending'))) {
      campaign.status = 'paused';
    } else {
      campaign.status = 'completed';
    }
    timers.delete(campaign.id);
    await persistCampaign(campaign);
    return;
  }
  contact.status = 'sending';
  try {
    const client = getActiveClient();
    if (!client.info) throw new Error('WhatsApp client is not ready');
    const body = `${campaign.title}\n\n${campaign.content}`;
    const recipient = `${campaign.countryPrefix}${contact.phone}@c.us`;
    if (campaign.image?.data) {
      const media = new MessageMedia(campaign.image.mimetype, campaign.image.data, campaign.image.filename);
      await client.sendMessage(recipient, media, { caption: body });
    } else {
      await client.sendMessage(recipient, body);
    }
    contact.status = 'sent';
    contact.sentAt = new Date().toISOString();
    campaign.sent += 1;
  } catch (error) {
    contact.status = 'failed';
    contact.error = error.message;
    campaign.failed += 1;
  }
  await persistCampaign(campaign);
  if (campaign.status !== 'running') {
    timers.delete(campaign.id);
    campaign.nextSendAt = null;
    await persistCampaign(campaign);
    return;
  }
  if (batch.contacts.some(item => item.status === 'pending')) {
    const delay = nextDelay(campaign);
    campaign.nextSendAt = new Date(Date.now() + delay).toISOString();
    timers.set(campaign.id, setTimeout(() => sendNext(campaign), delay));
  } else {
    batch.status = 'completed';
    campaign.status = 'paused';
    campaign.nextSendAt = null;
    timers.delete(campaign.id);
  }
  await persistCampaign(campaign);
}

export function createCampaign(input) {
  if (!input.title || !input.content) throw new Error('title and content are required');
  if ((!input.csv && !input.contacts?.length) || input.csv?.length > 5_000_000) throw new Error('Add at least one contact using CSV or manual entry');
  if (input.image?.data && (!/^image\/(jpeg|png|webp|gif)$/.test(input.image.mimetype) || input.image.data.length > 8_000_000)) throw new Error('Image must be JPG, PNG, WEBP or GIF and smaller than 6 MB');
  const csvContacts = input.csv ? parseContactsCsv(input.csv) : { contacts: [], invalid: [] };
  const manualContacts = parseManualContacts(input.contacts || [], new Set(csvContacts.contacts.map(contact => contact.phone)));
  const parsed = { contacts: [...csvContacts.contacts, ...manualContacts.contacts], invalid: [...csvContacts.invalid, ...manualContacts.invalid] };
  const batchSize = Math.max(1, Math.min(1000, Number(input.batchSize || 50)));
  const batches = splitContacts(parsed.contacts, batchSize);
  const campaign = {
    id: crypto.randomUUID(), title: input.title, content: input.content,
    countryPrefix: String(input.countryPrefix || '57').replace(/\D/g, ''),
    strategy: input.strategy === 'random' ? 'random' : 'fixed',
    intervalSeconds: Math.max(1, Math.min(86400, Number(input.intervalSeconds || 2))), image: input.image || null,
    contacts: parsed.contacts, batches, batchSize, activeBatchId: null, invalid: parsed.invalid, status: 'draft', sent: 0, failed: 0,
    nextSendAt: null, createdAt: new Date().toISOString()
  };
  campaigns.set(campaign.id, campaign);
  persistCampaign(campaign).catch(error => console.error('Campaign persistence failed:', error.message));
  return campaign;
}

export function listCampaigns() {
  return [...campaigns.values()].map(publicCampaign);
}

export function getCampaign(id) {
  const campaign = campaigns.get(id);
  return campaign ? { ...publicCampaign(campaign), contacts: campaign.contacts } : null;
}

export function getBatch(campaignId, batchId) {
  const campaign = campaigns.get(campaignId);
  return campaign?.batches.find(batch => batch.id === batchId) || null;
}

export function pauseRunningCampaigns() {
  for (const campaign of campaigns.values()) {
    if (campaign.status === 'running') pauseCampaign(campaign.id);
  }
}

export function startCampaign(id, batchId) {
  const campaign = campaigns.get(id);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'completed') throw new Error('Campaign already completed');
  if (campaign.status === 'cancelled') throw new Error('Campaign is cancelled');
  const selectedBatch = campaign.batches.find(batch => batch.id === (batchId || campaign.activeBatchId || campaign.batches.find(item => item.status !== 'completed')?.id));
  if (!selectedBatch) throw new Error('Batch not found');
  campaign.activeBatchId = selectedBatch.id;
  selectedBatch.status = 'running';
  campaign.status = 'running';
  persistCampaign(campaign).catch(error => console.error('Campaign persistence failed:', error.message));
  sendNext(campaign);
  return campaign;
}

export function pauseCampaign(id) {
  const campaign = campaigns.get(id);
  if (!campaign) throw new Error('Campaign not found');
  campaign.status = 'paused';
  const batch = campaign.batches.find(item => item.id === campaign.activeBatchId);
  if (batch?.status === 'running') batch.status = 'paused';
  clearTimeout(timers.get(id));
  timers.delete(id);
  persistCampaign(campaign).catch(error => console.error('Campaign persistence failed:', error.message));
  return campaign;
}

export function cancelCampaign(id) {
  const campaign = pauseCampaign(id);
  campaign.status = 'cancelled';
  campaign.contacts.filter(contact => contact.status === 'pending').forEach(contact => { contact.status = 'cancelled'; });
  persistCampaign(campaign).catch(error => console.error('Campaign persistence failed:', error.message));
  return campaign;
}

export async function deleteCampaign(id) {
  const campaign = campaigns.get(id);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'running') throw new Error('Pause the campaign before deleting it');
  clearTimeout(timers.get(id));
  timers.delete(id);
  campaigns.delete(id);
  if (await checkRedisConnection()) await redis.hdel(CAMPAIGNS_KEY, id);
  return { id };
}
