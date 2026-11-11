window.MarineReminders = (() => {
  const tokenKey = 'marine_push_device_v1';
  const gymKey = 'marine_push_enabled_v1';
  const eveningKey = 'marine_push_evening_v1';
  const status = text => { document.getElementById('gymReminderStatus').textContent = text; };
  const buttons = () => document.querySelectorAll('[data-reminder-kind]');
  let serviceURL = '', publicKey = '', busy = false;

  function token() {
    let value = localStorage.getItem(tokenKey);
    if (!value) {
      value = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(tokenKey, value);
    }
    return value;
  }

  function preferences() {
    return { gym: localStorage.getItem(gymKey) === 'true', evening: localStorage.getItem(eveningKey) === 'true' };
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

  function render(active) {
    for (const button of buttons()) {
      const kind = button.dataset.reminderKind;
      const time = kind === 'gym' ? '4 p.m. gym' : '8:30 p.m. evening';
      button.textContent = (active[kind] ? 'Turn off ' : 'Enable ') + time + ' reminder';
      button.hidden = false;
    }
    status('Times are Central. Choose which reminders you want.');
  }

  async function toggle(kind = 'gym') {
    if (busy || !['gym', 'evening'].includes(kind)) return;
    busy = true;
    buttons().forEach(button => { button.disabled = true; });
    let subscription, created = false;
    try {
      const next = preferences();
      next[kind] = !next[kind];
      if (next[kind] && await Notification.requestPermission() !== 'granted') {
        throw new Error('Allow notifications in iPhone Settings to receive reminders.');
      }
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      if (!next.gym && !next.evening) {
        await request('DELETE', { token: token() });
        // Delivery stops when the server record is removed. Clear the local subscription when possible.
        if (subscription) await subscription.unsubscribe().catch(() => {});
      } else {
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
          created = true;
        }
        status('Updating reminders…');
        await request('POST', { token: token(), subscription: subscription.toJSON(), preferences: next, test: next[kind], kind });
      }
      localStorage.setItem(gymKey, String(next.gym));
      localStorage.setItem(eveningKey, String(next.evening));
      render(next);
    } catch (error) {
      if (created) await subscription?.unsubscribe().catch(() => {});
      status(error.message || 'Reminder setup failed. Try again.');
    } finally {
      busy = false;
      buttons().forEach(button => { button.disabled = false; });
    }
  }

  async function init() {
    const journey = document.getElementById('mcJourney');
    if (!journey) return;
    const section = document.createElement('details');
    section.innerHTML = '<summary>Gym &amp; evening reminders</summary><p id="gymReminderStatus" class="small" role="status">Checking reminder connection…</p><button class="secondary" data-reminder-kind="gym" type="button" hidden></button><button class="secondary" data-reminder-kind="evening" type="button" hidden></button>';
    journey.append(section);
    buttons().forEach(button => { button.onclick = () => toggle(button.dataset.reminderKind); });
    try {
      const configResponse = await fetch('./reminder-config.json', { cache: 'no-store' });
      if (!configResponse.ok) throw new Error('Reminder setup is pending.');
      const config = await configResponse.json();
      if (!config.serviceURL) throw new Error('Reminder setup is pending.');
      const url = new URL(config.serviceURL);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
        throw new Error('Reminder service configuration needs repair.');
      }
      serviceURL = url.origin;
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window) ||
          (/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches))) {
        throw new Error('Open Marine Comeback from your Home Screen to enable notifications.');
      }
      const response = await fetch(serviceURL + '/api/push', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Reminder service could not be reached.');
      const info = await response.json();
      if (!info.ready || !info.publicKey) throw new Error('Reminder setup is pending.');
      publicKey = info.publicKey;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const active = preferences();
      if (Notification.permission === 'granted' && subscription && (active.gym || active.evening)) {
        await request('POST', { token: token(), subscription: subscription.toJSON(), preferences: active, kind: active.gym ? 'gym' : 'evening' });
      }
      render(active);
    } catch (error) { status(error.message || 'Reminder service could not be reached.'); }
  }

  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'marine-gym-reminder') window.MarineJourney?.open();
  });
  document.addEventListener('DOMContentLoaded', init);
  return { toggle };
})();
