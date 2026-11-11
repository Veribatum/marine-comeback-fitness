import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderPayload, validateSubscription, subscriptionPath, sendDaily } from './reminders.js';
import { POST, DELETE } from '../api/push.js';

test('push registration rejects arbitrary URLs and invalid device credentials', () => {
  const keys = { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) };
  assert.equal(validateSubscription({ endpoint: 'https://web.push.apple.com/test', keys }).endpoint, 'https://web.push.apple.com/test');
  for (const endpoint of ['http://web.push.apple.com/test', 'https://127.0.0.1/',
    'https://web.push.apple.com.evil.test/', 'https://web.push.apple.com:9000/test']) {
    assert.throws(() => validateSubscription({ endpoint, keys }));
  }
  assert.throws(() => subscriptionPath('../devices/other'));
  assert.match(subscriptionPath('a'.repeat(64)), /^devices\/[a-f0-9]{64}\.json$/);
});

test('reminder dates follow Central Time across midnight and daylight saving', () => {
  const before = reminderPayload(new Date('2026-11-02T05:30:00Z'));
  const after = reminderPayload(new Date('2026-11-02T06:30:00Z'));
  assert.equal(before.tag, 'marine-gym-2026-11-01');
  assert.equal(after.tag, 'marine-gym-2026-11-02');
  assert.equal(reminderPayload(new Date('2026-07-02T04:30:00Z')).tag, 'marine-gym-2026-07-01');
  assert(!/Full|Minimum|Recovery/.test(before.body));
});

test('concurrent scheduled deliveries claim once and remove expired subscriptions', async () => {
  const claims = new Set(), removed = [], sent = [];
  const storage = {
    async list() { return { blobs: [{ pathname: 'devices/one.json' }, { pathname: 'devices/expired.json' }], hasMore: false }; },
    async put(path) {
      if (claims.has(path)) { const error = new Error(); error.name = 'BlobAlreadyExistsError'; throw error; }
      claims.add(path);
    },
    async del(path) { removed.push(path); claims.delete(path); },
    async readDevice(path) {
      if (path.startsWith('deliveries/')) return claims.has(path) ? {} : null;
      return { subscription: { endpoint: path } };
    }
  };
  const send = async subscription => {
    if (subscription.endpoint.includes('expired')) { const error = new Error(); error.statusCode = 410; throw error; }
    sent.push(subscription.endpoint);
  };
  await Promise.all([sendDaily(new Date('2026-11-10T22:00:00Z'), storage, send),
    sendDaily(new Date('2026-11-10T22:00:00Z'), storage, send)]);
  assert.deepEqual(sent, ['devices/one.json']);
  assert.deepEqual(removed, ['devices/expired.json']);
});

test('failed delivery releases its claim for a later retry', async () => {
  const removed = [];
  const storage = {
    async list() { return { blobs: [{ pathname: 'devices/one.json' }] }; },
    async put() {}, async del(path) { removed.push(path); },
    async readDevice() { return { subscription: {} }; }
  };
  await assert.rejects(sendDaily(new Date(), storage, async () => { throw new Error('Network error'); }));
  assert.equal(removed.length, 1);
  assert.match(removed[0], /^deliveries\//);
});

test('subscription endpoint rejects foreign origins and malformed requests before storage', async () => {
  const foreign = await POST(new Request('https://service.test/api/push', {
    method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}'
  }));
  assert.equal(foreign.status, 403);
  const malformed = await DELETE(new Request('https://service.test/api/push', {
    method: 'DELETE', headers: { Origin: 'https://veribatum.github.io', 'Content-Type': 'application/json' }, body: '{}'
  }));
  assert.equal(malformed.status, 400);
});

test('evening delivery goes only to opted-in devices and opens the evening screen', async () => {
  const devices = {
    'devices/old.json': { subscription: { endpoint: 'legacy' } },
    'devices/gym.json': { subscription: { endpoint: 'gym' }, preferences: { gym: true, evening: false } },
    'devices/evening.json': { subscription: { endpoint: 'evening' }, preferences: { gym: false, evening: true } }
  };
  const sent = [];
  const storage = {
    list: async () => ({ blobs: Object.keys(devices).map(pathname => ({ pathname })), hasMore: false }),
    readDevice: async path => devices[path],
    put: async () => {},
    del: async () => {}
  };
  const send = async (subscription, payload) => sent.push({ endpoint: subscription.endpoint, payload });
  await sendDaily(new Date('2026-11-11T02:30:00Z'), storage, send, 'evening');
  assert.deepEqual(sent.map(entry => entry.endpoint), ['evening']);
  assert.equal(sent[0].payload.type, 'marine-evening-reminder');
  assert.equal(new URL(sent[0].payload.url).search, '?mission=evening');
  sent.length = 0;
  await sendDaily(new Date('2026-11-10T22:00:00Z'), storage, send);
  assert.deepEqual(sent.map(entry => entry.endpoint), ['legacy', 'gym']);
});
