window.MarineReminders = (() => {
  const TOKEN_KEY = 'marine_push_device_v1';
  const ENABLED_KEY = 'marine_push_enabled_v1';
  let serviceURL = '', publicKey = '', busy = false;
  const status = text => { document.getElementById('gymReminderStatus').textContent = text; };
  const button = () => document.getElementById('gymReminderToggle');

  function token() {
    let value = localStorage.getItem(TOKEN_KEY);
    if (!value) {
      value = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }

  function keyBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  }

  async function request(method, body) {
    const response = await fetch(serviceURL + '/api/push', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Reminder connection failed.');
    return result;
  }

  function showEnabled(enabled) {
    button().textContent = enabled ? 'Turn off gym reminder' : 'Enable 4 p.m. reminder';
    button().dataset.enabled = String(enabled);
    status(enabled ? 'Connected for a daily 4 p.m. Central reminder. Tap the notification for your goblin video.' : 'Gym reminder is off.');
  }

  async function toggle() {
    if (busy) return;
    busy = true; button().disabled = true;
    let subscription, created = false;
    try {
      const enabled = button().dataset.enabled === 'true';
      // Request iPhone permission directly from this button's user gesture.
      if (!enabled && await Notification.requestPermission() !== 'granted') {
        throw new Error('Notifications were not allowed. Enable them in iPhone Settings to receive reminders.');
      }
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      if (enabled) {
        await request('DELETE', { token: token() });
        if (subscription) await subscription.unsubscribe();
        localStorage.removeItem(ENABLED_KEY);
        showEnabled(false);
      } else {
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
          created = true;
        }
        status('Connecting your reminder…');
        await request('POST', { token: token(), subscription: subscription.toJSON(), test: true });
        localStorage.setItem(ENABLED_KEY, 'true');
        showEnabled(true);
      }
    } catch (error) {
      if (created) await subscription?.unsubscribe().catch(() => {});
      status(error.message || 'Reminder setup failed. Try again.');
    } finally { busy = false; button().disabled = false; }
  }

  async function init() {
    if (!document.getElementById('mcJourney')) return;
    const section = document.createElement('details');
    section.innerHTML = '<summary>Gym reminder</summary><p id="gymReminderStatus" class="small" role="status">Checking reminder connection…</p><button id="gymReminderToggle" class="secondary" type="button" hidden>Enable 4 p.m. reminder</button>';
    document.getElementById('mcJourney').append(section);
    button().onclick = toggle;
    try {
      const configResponse = await fetch('./reminder-config.json', { cache: 'no-store' });
      if (!configResponse.ok) throw new Error('Reminder service setup is pending. Your temporary ChatGPT reminder remains active.');
      const config = await configResponse.json();
      if (!config.serviceURL) throw new Error('Reminder service setup is pending. Your temporary ChatGPT reminder remains active.');
      const url = new URL(config.serviceURL);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
        throw new Error('Reminder service configuration needs repair.');
      }
      serviceURL = url.origin;
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Open Marine Comeback from your Home Screen to enable notifications.');
      }
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches)) {
        throw new Error('Open Marine Comeback using your existing Home Screen icon to enable notifications.');
      }
      const response = await fetch(serviceURL + '/api/push', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Reminder service could not be reached.');
      const info = await response.json();
      if (!info.ready || !info.publicKey) throw new Error('Reminder service setup is pending. Your temporary ChatGPT reminder remains active.');
      publicKey = info.publicKey;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (Notification.permission === 'granted' && subscription && localStorage.getItem(ENABLED_KEY)) {
        // Re-register to repair a lost server record without sending another confirmation each launch.
        await request('POST', { token: token(), subscription: subscription.toJSON() });
        showEnabled(true);
      } else showEnabled(false);
      button().hidden = false;
    } catch (error) { status(error.message || 'Reminder service could not be reached.'); }
  }

  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'marine-gym-reminder') window.MarineJourney?.open();
  });
  document.addEventListener('DOMContentLoaded', init);
  return { toggle };
})();
