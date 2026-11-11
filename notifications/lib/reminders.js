import { createHash } from 'node:crypto';
import * as webpush from 'web-push';
import { get, put, list, del } from '@vercel/blob';

export const APP_URL = 'https://veribatum.github.io/marine-comeback-fitness/';
export const APP_ORIGIN = new URL(APP_URL).origin;
export const TIMEZONE = 'America/Chicago';
const digest = value => createHash('sha256').update(value).digest('hex');

export function subscriptionPath(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Invalid device token.');
  }
  return 'devices/' + digest(token) + '.json';
}

export function validateSubscription(value) {
  const endpoint = new URL(value?.endpoint);
  const host = endpoint.hostname;
  const supported = host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
    host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.notify.windows.com');
  const keys = value?.keys;
  if (endpoint.protocol !== 'https:' || !supported || endpoint.port ||
      endpoint.username || endpoint.password || endpoint.hash || endpoint.href.length > 2048 ||
      typeof keys?.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) ||
      typeof keys?.auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)) {
    throw new Error('Invalid push subscription.');
  }
  return { endpoint: endpoint.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function reminderPayload(date = new Date(), test = false, kind = 'gym') {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  if (kind === 'evening') {
    return { title: 'Marine Comeback', type: 'marine-evening-reminder',
      body: test ? 'Evening reminders are connected. Tap to open your evening routine.' :
        'Marine, put the scroll down. Read for ten minutes or write one line before bed.',
      tag: test ? 'marine-evening-test' : 'marine-evening-' + day,
      url: APP_URL + '?mission=evening', sentAt: date.toISOString() };
  }
  const lines = [
    'Marine, grab your gym bag. The goblin has your pep talk ready.',
    'Marine, the couch can wait. Your gym goblin is ready.',
    'Marine, time for the gym. Tap for your goblin pep talk.'
  ];
  return { title: 'Marine Comeback',
    body: test ? 'Reminders are connected. Tap for your goblin video.' : lines[Math.floor(date.getTime() / 86400000) % lines.length],
    tag: test ? 'marine-reminder-test' : 'marine-gym-' + day,
    url: APP_URL + '?mission=departure', sentAt: date.toISOString() };
}

export async function readDevice(path) {
  const result = await get(path, { access: 'private', useCache: false });
  return result?.statusCode === 200 ? new Response(result.stream).json() : null;
}

export async function saveDevice(path, subscription, preferences) {
  await put(path, JSON.stringify({ subscription, preferences }), { access: 'private',
    contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
}

export async function hasDeviceCapacity() {
  const page = await list({ prefix: 'devices/', limit: 20 });
  return page.blobs.length < 20;
}

export async function removeDevice(path) { await del(path); }

export async function sendPush(subscription, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('Push credentials are missing.');
  }
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: APP_URL, publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY },
    TTL: 1800, urgency: 'high', timeout: 10000
  });
}

export async function sendDaily(scheduledAt, storage = { list, put, del, readDevice }, send = sendPush, kind = 'gym') {
  const payload = reminderPayload(scheduledAt, false, kind);
  let cursor, sent = 0, failed = 0;
  do {
    const page = await storage.list({ prefix: 'devices/', limit: 100, cursor });
    for (const blob of page.blobs) {
      const device = await storage.readDevice(blob.pathname);
      if (!device || !(device.preferences?.[kind] ?? (kind === 'gym'))) continue;
      const claim = 'deliveries/' + payload.tag + '/' + digest(blob.pathname) + '.json';
      // Create-only claims prevent two scheduler invocations from sending the same daily cue.
      try {
        await storage.put(claim, '{}', { access: 'private', addRandomSuffix: false, allowOverwrite: false, ttlDays: 8 });
      } catch (error) {
        if (await storage.readDevice(claim)) continue;
        throw error;
      }
      try {
        await send(device.subscription, payload);
        sent++;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await storage.del(blob.pathname);
        } else {
          await storage.del(claim);
          failed++;
          console.error('Reminder delivery failed', { status: error.statusCode || 'internal' });
        }
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log('Reminders processed', { kind, sent, failed });
  if (failed) throw new Error('Some reminders could not be sent.');
  return { sent };
}
