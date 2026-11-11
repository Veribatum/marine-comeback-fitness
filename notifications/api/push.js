import { APP_ORIGIN, TIMEZONE, subscriptionPath, validateSubscription, readDevice,
  saveDevice, removeDevice, hasDeviceCapacity, reminderPayload, sendPush } from '../lib/reminders.js';

function response(body, status = 200) {
  return Response.json(body, { status, headers: {
    'Access-Control-Allow-Origin': APP_ORIGIN, 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store'
  } });
}

export async function GET() {
  const ready = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY &&
    (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID));
  return response({ ready, publicKey: ready ? process.env.VAPID_PUBLIC_KEY : null,
    timezone: TIMEZONE, hour: 16 });
}

export function OPTIONS() { return response({}); }

export async function POST(request) { return change(request); }
export async function DELETE(request) { return change(request); }

async function change(request) {
  if (request.headers.get('origin') !== APP_ORIGIN) return response({ error: 'Origin denied.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ error: 'JSON required.' }, 415);
  }
  const text = await request.text();
  if (text.length > 8192) return response({ error: 'Request too large.' }, 413);
  let data, path, subscription;
  try {
    data = JSON.parse(text);
    path = subscriptionPath(data.token);
    if (request.method === 'POST') subscription = validateSubscription(data.subscription);
  } catch { return response({ error: 'Invalid subscription request.' }, 400); }
  try {
    if (request.method === 'DELETE') {
      await removeDevice(path);
      return response({ enabled: false });
    }
    const previous = await readDevice(path);
    if (!previous && !await hasDeviceCapacity()) {
      return response({ error: 'Reminder device limit reached.' }, 409);
    }
    // Send a confirmation through the push service before reporting a connection as working.
    if (!previous || previous.subscription.endpoint !== subscription.endpoint || data.test === true) {
      await sendPush(subscription, reminderPayload(new Date(), true));
    }
    await saveDevice(path, subscription);
    return response({ enabled: true });
  } catch (error) {
    console.error('Push registration failed', { status: error.statusCode || 'internal' });
    return response({ error: 'Reminder connection failed. Please try again.' }, 503);
  }
}
