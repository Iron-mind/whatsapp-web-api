import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContactsCsv, parseManualContacts, splitContacts } from '../src/csv.js';

test('normalizes, deduplicates and reports invalid phone rows', () => {
  const result = parseContactsCsv('phone,name\n+57 300-123-4567,Ana\n573001234567,Duplicate\n123,Invalid\n573001234568,"Name, with comma"');
  assert.deepEqual(result.contacts.map(contact => contact.phone), ['573001234567', '573001234568']);
  assert.equal(result.invalid.length, 2);
  assert.equal(result.invalid[0].reason, 'duplicate');
  assert.equal(result.invalid[1].reason, 'invalid phone');
});

test('requires a phone header and splits contacts into stable batches', () => {
  assert.throws(() => parseContactsCsv('mobile\n573001234567'), /phone column/);
  const contacts = Array.from({ length: 5 }, (_, index) => ({ phone: String(index) }));
  const batches = splitContacts(contacts, 2);
  assert.deepEqual(batches.map(batch => batch.id), ['batch-1', 'batch-2', 'batch-3']);
  assert.deepEqual(batches.map(batch => batch.contacts.length), [2, 2, 1]);
});

test('normalizes manual contacts and rejects duplicates from the CSV set', () => {
  const result = parseManualContacts(['+57 300-123-4567', '573001234568', '300'], new Set(['573001234567']));
  assert.deepEqual(result.contacts.map(contact => contact.phone), ['573001234568']);
  assert.deepEqual(result.invalid.map(row => row.reason), ['duplicate', 'invalid phone']);
});
