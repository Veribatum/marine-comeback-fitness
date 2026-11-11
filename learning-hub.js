window.MarineLearning = (() => {
  const keyName = 'marine_learning_key_v1';
  const summaryName = 'marine_learning_summary_v1';
  const sources = {
    mind: 'https://mind-expansion.jamean-berry.chatgpt.site/',
    nova: 'https://veribatum.github.io/Nerd-nova-academy-/'
  };
  let busy = false, refreshedAt = 0;
  const byId = id => document.getElementById(id);

  function key() {
    let value = localStorage.getItem(keyName);
    if (!/^[a-f0-9]{64}$/.test(value || '')) {
      value = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(keyName, value);
    }
    return value;
  }

  function summary() {
    try { return JSON.parse(localStorage.getItem(summaryName) || '{}'); }
    catch { return {}; }
  }

  function paint(data = summary()) {
    const count = (value, noun, plural) => (value || 0) + ' ' + (value === 1 ? noun : plural);
    const mind = byId('mcLearnMindCount');
    mind.hidden = !data.mindConnected;
    mind.textContent = 'Mind Expansion · ' + count(data.lessons, 'lesson learned', 'lessons learned') + ' · ' + (data.mindXP || 0) + ' XP';
    const nova = byId('mcLearnNovaCount');
    nova.hidden = !data.novaConnected;
    nova.textContent = 'Nova Academy · ' + count(data.missions, 'mission completed', 'missions completed') + ' · ' + (data.novaXP || 0) + ' XP';
    byId('mcLearnXp').textContent = ((data.mindXP || 0) + (data.novaXP || 0)).toLocaleString() + ' learning XP';
    byId('mcLearnMind').textContent = data.mindConnected ? 'Open Mind Expansion' : 'Connect & open Mind Expansion';
    byId('mcLearnNova').textContent = data.novaConnected ? 'Open Nova Academy' : 'Connect & open Nova Academy';
  }

  async function refresh(force = false) {
    const status = byId('mcLearnStatus');
    if (!status || busy || (!force && Date.now() - refreshedAt < 5000)) return;
    busy = true;
    try {
      const config = await fetch('./reminder-config.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!config.ok) throw Error('Could not load the learning service');
      const base = new URL((await config.json()).serviceURL);
      if (base.origin !== 'https://marine-comeback-reminders.vercel.app') throw Error('Unexpected learning service');
      const response = await fetch(new URL('/api/learning', base), {
        headers: { Authorization: 'Bearer ' + key() }, cache: 'no-store', signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw Error('Progress unavailable');
      const data = await response.json();
      localStorage.setItem(summaryName, JSON.stringify(data));
      paint(data);
      window.MarineJourney?.render();
      status.textContent = data.mindConnected || data.novaConnected ? 'Progress synced.' : '';
      refreshedAt = Date.now();
    } catch {
      status.textContent = 'Could not refresh progress. Try again when online.';
    } finally { busy = false; }
  }

  function mount() {
    const panel = byId('mcLearningHub');
    if (!panel) return;
    panel.innerHTML = `
      <p id="mcLearnXp" class="small"></p>
      <p id="mcLearnMindCount" class="small" hidden></p>
      <p id="mcLearnNovaCount" class="small" hidden></p>`;
    byId('mcLearnAppControls').innerHTML = `
      <div class="mcLearnSource"><a id="mcLearnMind" class="secondary" rel="noreferrer">Open Mind Expansion</a></div>
      <div class="mcLearnSource"><a id="mcLearnNova" class="secondary" rel="noreferrer">Open Nova Academy</a></div>
      <button type="button" id="mcLearnRefresh" class="secondary">Refresh progress</button>
      <details><summary>Connection help</summary><p class="small">Opening an app from Learn connects its completed lessons or missions to this hub. If sign-in interrupts the connection, copy this code and use Connect learning progress in that app.</p>
      <label for="mcLearnCode">Private connection code</label><input id="mcLearnCode" readonly autocomplete="off" spellcheck="false"><button type="button" id="mcLearnCopy" class="secondary">Copy code</button></details>
      <p id="mcLearnStatus" role="status" class="small"></p>`;
    try {
      const code = key();
      for (const [source, id] of [['mind', 'mcLearnMind'], ['nova', 'mcLearnNova']]) {
        byId(id).href = sources[source] + '#marine-hub=' + code;
      }
      byId('mcLearnCode').value = code;
      byId('mcLearnCopy').onclick = async () => {
        try { await navigator.clipboard.writeText(code); byId('mcLearnStatus').textContent = 'Connection code copied.'; }
        catch { byId('mcLearnCode').select(); }
      };
      byId('mcLearnRefresh').onclick = () => refresh(true);
      paint();
      window.addEventListener('pageshow', () => { if (byId('mcEveningDialog')?.open) void refresh(); });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && byId('mcEveningDialog')?.open) void refresh();
      });
    } catch { byId('mcLearnStatus').textContent = 'Allow app storage to connect learning progress.'; }
  }
  return { mount, refresh };
})();
