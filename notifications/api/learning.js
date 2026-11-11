import { createHash } from 'node:crypto';
import { get, list, put } from '@vercel/blob';
import { APP_ORIGIN } from '../lib/reminders.js';

const MIND = 'https://mind-expansion.jamean-berry.chatgpt.site';
const origins = new Set([APP_ORIGIN, MIND]);
const tokenPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[\w.:-]{1,180}$/;
const maxRecords = 3000;

function reply(origin, body, status = 200) {
  return Response.json(body, { status, headers: {
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : APP_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store', Vary: 'Origin'
  } });
}

function scope(request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  return tokenPattern.test(token || '') ? 'learning/' + createHash('sha256').update(token).digest('hex') + '/' : null;
}

function validSnapshot(data, expectedSource) {
  const xp = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
  return data?.source === expectedSource && tokenPattern.test(data.device || '') &&
    Array.isArray(data.completed) && data.completed.length <= maxRecords &&
    data.completed.every(id => typeof id === 'string' && idPattern.test(id)) &&
    Array.isArray(data.rewards) && data.rewards.length <= maxRecords &&
    data.rewards.every(pair => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' &&
      idPattern.test(pair[0]) && xp(pair[1])) && xp(data.legacyXP);
}

export function summarize(snapshots) {
  const lessons = new Set(), missions = new Set(), rewards = new Map();
  let mindConnected = false, novaConnected = false, legacyXP = 0;
  for (const data of snapshots) {
    if (data.source === 'mind') {
      mindConnected = true;
      data.completed.forEach(id => lessons.add(id));
    } else if (data.source === 'nova') {
      novaConnected = true;
      data.completed.forEach(id => missions.add(id));
      for (const [id, xp] of data.rewards) rewards.set(id, Math.max(xp, rewards.get(id) || 0));
      legacyXP = Math.max(legacyXP, data.legacyXP);
    }
  }
  const mindXP = lessons.size * 10;
  const novaXP = [...rewards.values()].reduce((sum, xp) => sum + xp, legacyXP);
  return { lessons: lessons.size, missions: missions.size, mindXP, novaXP, mindConnected, novaConnected };
}

export function OPTIONS(request) { return reply(request.headers.get('Origin'), {}); }

export async function PUT(request) {
  const origin = request.headers.get('Origin');
  const prefix = scope(request);
  const source = origin === MIND ? 'mind' : origin === APP_ORIGIN ? 'nova' : null;
  if (!prefix || !source) return reply(origin, { error: 'Connection required.' }, 403);
  let data;
  try {
    const body = await request.text();
    if (body.length > 600000) return reply(origin, { error: 'Progress record too large.' }, 413);
    data = JSON.parse(body);
  } catch { return reply(origin, { error: 'Invalid progress record.' }, 400); }
  if (!validSnapshot(data, source)) return reply(origin, { error: 'Invalid progress record.' }, 400);
  const { device, completed, rewards, legacyXP } = data;
  try {
    await put(prefix + source + '-' + device + '.json', JSON.stringify({ source, completed, rewards, legacyXP }),
      { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    return reply(origin, { synced: true });
  } catch (error) {
    console.error('Learning sync write failed', error.name);
    return reply(origin, { error: 'Could not sync. Try again when online.' }, 503);
  }
}

export async function GET(request) {
  const origin = request.headers.get('Origin');
  const prefix = scope(request);
  if (!prefix || origin !== APP_ORIGIN) return reply(origin, { error: 'Connection required.' }, 403);
  try {
    const snapshots = [];
    let cursor;
    do {
      const page = await list({ prefix, limit: 50, cursor });
      const records = await Promise.all(page.blobs.map(async ({ pathname }) => {
        const result = await get(pathname, { access: 'private', useCache: false });
        return result?.statusCode === 200 ? new Response(result.stream).json() : null;
      }));
      snapshots.push(...records.filter(Boolean));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return reply(origin, summarize(snapshots));
  } catch (error) {
    console.error('Learning sync read failed', error.name);
    return reply(origin, { error: 'Could not load progress.' }, 503);
  }
}
