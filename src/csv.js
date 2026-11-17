function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseContactsCsv(text) {
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  if (!rows.length) throw new Error('CSV is empty');
  const header = parseCsvLine(rows.shift()).map(value => value.toLowerCase());
  const phoneIndex = header.indexOf('phone');
  if (phoneIndex === -1) throw new Error('CSV must contain a phone column');
  const seen = new Set();
  const contacts = [];
  const invalid = [];
  rows.forEach((row, index) => {
    const columns = parseCsvLine(row);
    const originalPhone = columns[phoneIndex] || '';
    const phone = originalPhone.replace(/[^\d]/g, '');
    if (!/^\d{7,15}$/.test(phone) || seen.has(phone)) {
      invalid.push({ row: index + 2, phone: originalPhone, reason: seen.has(phone) ? 'duplicate' : 'invalid phone' });
      return;
    }
    seen.add(phone);
    contacts.push({ phone, status: 'pending', error: null, sentAt: null });
  });
  return { contacts, invalid };
}

export function parseManualContacts(values, existingPhones = new Set()) {
  const contacts = [];
  const invalid = [];
  const seen = new Set(existingPhones);
  values.forEach((value, index) => {
    const originalPhone = String(value || '').trim();
    const phone = originalPhone.replace(/[^\d]/g, '');
    if (!/^\d{7,15}$/.test(phone) || seen.has(phone)) {
      invalid.push({ row: index + 1, phone: originalPhone, reason: seen.has(phone) ? 'duplicate' : 'invalid phone' });
      return;
    }
    seen.add(phone);
    contacts.push({ phone, status: 'pending', error: null, sentAt: null });
  });
  return { contacts, invalid };
}

export function splitContacts(contacts, batchSize) {
  const size = Math.max(1, Number(batchSize || 50));
  const batches = [];
  for (let index = 0; index < contacts.length; index += size) {
    batches.push({ id: `batch-${batches.length + 1}`, contacts: contacts.slice(index, index + size), status: 'pending' });
  }
  return batches;
}
