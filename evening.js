(() => {
  const storageKey = 'marine_evening_v1';
  const duration = 10 * 60 * 1000;
  const byId = id => document.getElementById(id);
  const dateKey = (date = new Date()) => [
    date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')
  ].join('-');
  const prompts = ['What went well?', 'What’s still on my mind?', 'What’s one thing I’ll do tomorrow?'];
  const captions = {
    reading: 'Marine, put the scroll down. Ten minutes. Open to where you left off.',
    journal: 'One good thing. One thing on your mind. One thing for tomorrow. Then call it a night.',
    recap: 'Marine, look at what you followed through on this week. That counts.'
  };
  let draftDate, ticker;

  function read() {
    const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return { ...data, days: data.days || {} };
  }

  function change(edit) {
    try {
      const data = read();
      edit(data);
      localStorage.setItem(storageKey, JSON.stringify(data));
      render();
      window.MarineJourney?.render(true);
      return true;
    } catch {
      byId('mcEveningStatus').textContent = 'Could not save on this device. Your text is still here.';
      return false;
    }
  }

  function clip(name) {
    const video = document.createElement('video');
    video.src = './evening/' + name + '.mp4';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', captions[name]);
    byId('mcEveningClip').replaceChildren(video);
    byId('mcEveningCaption').textContent = captions[name];
  }

  function select(section) {
    for (const tab of ['reading', 'journal', 'recap']) {
      byId('mcEvening-' + tab).hidden = tab !== section;
      document.querySelector('[data-evening-tab="' + tab + '"]').setAttribute('aria-pressed', String(tab === section));
    }
    const unlocked = section !== 'recap' || Object.values(read().days).filter(day => day.reading || day.journal).length >= 3;
    const video = byId('mcEveningVideo');
    video.hidden = !unlocked;
    video.open = false;
    byId('mcEveningUnlock').hidden = unlocked;
    if (section === 'reading') window.MarineLearning?.refresh();
    if (unlocked) clip(section);
    else byId('mcEveningClip').replaceChildren();
    byId('mcEveningStatus').textContent = '';
  }

  function renderClock() {
    const timer = read().timer;
    const seconds = timer ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000)) : 600;
    byId('mcEveningClock').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    byId('mcEveningStart').hidden = !!timer;
    byId('mcEveningCancel').hidden = !timer;
    byId('mcEveningLog').hidden = !timer || seconds > 0;
  }

  function render() {
    const data = read();
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
    const thisWeek = key => key >= dateKey(monday) && key <= dateKey(today);
    let fitness = {};
    try { fitness = JSON.parse(localStorage.getItem('marine_data_v5') || '{}') || {}; } catch {}
    const workouts = Object.keys(fitness).filter(key => thisWeek(key) &&
      (fitness[key]?.workout || fitness[key]?.gymSession || fitness[key]?.runSession)).length;
    const week = Object.entries(data.days).filter(([key]) => thisWeek(key));
    const reading = week.filter(([, day]) => day.reading).length;
    const journals = week.filter(([, day]) => day.journal?.answers?.some(Boolean)).length;
    const summary = [workouts + (workouts === 1 ? ' workout day' : ' workout days'),
      reading + (reading === 1 ? ' reading night' : ' reading nights'),
      journals + (journals === 1 ? ' journal entry' : ' journal entries')].join(' · ');
    byId('mcEveningWeek').textContent = summary;
    byId('mcEveningRecap').textContent = summary;
    byId('mcEveningMark').textContent = data.checkpoint ? 'Last stopped at ' + data.checkpoint : '';
    const picker = byId('mcEveningDate');
    const dates = [dateKey(today), ...Object.keys(data.days).filter(key => key !== dateKey(today) && data.days[key].journal).sort().reverse()];
    picker.replaceChildren(...dates.map(key => new Option(key === dateKey(today) ? 'Today' : key, key)));
    picker.value = draftDate || dates[0];
    renderClock();
  }

  function loadJournal(key) {
    draftDate = key;
    const journal = read().days[key]?.journal;
    prompts.forEach((_, index) => { byId('mcEveningAnswer' + index).value = journal?.answers?.[index] || ''; });
    byId('mcEveningMood').value = journal?.mood || '';
  }

  function open(section = 'reading') {
    const dialog = byId('mcEveningDialog');
    if (!dialog.open) {
      if (!draftDate) loadJournal(dateKey());
      if (!byId('mcEveningCheckpoint').value) byId('mcEveningCheckpoint').value = read().checkpoint || '';
      dialog.showModal();
    }
    render();
    select(section);
    if (!ticker) ticker = setInterval(renderClock, 1000);
  }

  function init() {
    const fitness = byId('fitnessPhase2');
    if (!fitness) return;
    const card = document.createElement('section');
    card.id = 'mcEveningCard';
    card.innerHTML = '<button type="button" id="mcEveningOpen" class="secondary">Evening</button><p id="mcEveningWeek" class="small" aria-label="This week"></p>';
    fitness.append(card);
    const dialog = document.createElement('dialog');
    dialog.id = 'mcEveningDialog';
    dialog.className = 'jDialog';
    dialog.setAttribute('aria-labelledby', 'mcEveningTitle');
    dialog.innerHTML = `
      <form method="dialog"><button class="secondary jClose">Close</button></form>
      <h2 id="mcEveningTitle">Evening</h2>
      <div class="eveTabs" aria-label="Evening activities">
        <button type="button" data-evening-tab="reading" class="secondary">Learn</button>
        <button type="button" data-evening-tab="journal" class="secondary">Journal</button>
        <button type="button" data-evening-tab="recap" class="secondary">This week</button>
      </div>
      <details id="mcEveningVideo"><summary>Play the goblin clip</summary><div id="mcEveningClip"></div><p class="small" id="mcEveningCaption"></p></details>
      <section id="mcEvening-reading">
        <div id="mcLearningHub"></div>
        <details class="mcLearnTimer"><summary>Reading timer</summary>
        <p id="mcEveningMark" class="small"></p>
        <p id="mcEveningClock" aria-label="Reading timer">10:00</p>
        <button type="button" id="mcEveningStart">Read for 10 minutes</button>
        <label for="mcEveningCheckpoint">Where did you leave off? (optional)</label>
        <input id="mcEveningCheckpoint" type="text" maxlength="160" placeholder="Book, chapter, or page">
        <button type="button" id="mcEveningLog" hidden>Log reading</button>
        <button type="button" id="mcEveningCancel" class="secondary" hidden>Reset timer</button>
        </details>
        <details id="mcLearnApps"><summary>Learning apps</summary><div id="mcLearnAppControls"></div></details>
      </section>
      <section id="mcEvening-journal" hidden>
        <label for="mcEveningDate">Journal date</label><select id="mcEveningDate"></select>
        ${prompts.map((prompt, index) => '<label for="mcEveningAnswer' + index + '">' + prompt + '</label><textarea maxlength="3000" id="mcEveningAnswer' + index + '"></textarea>').join('')}
        <label for="mcEveningMood">Mood (optional)</label>
        <select id="mcEveningMood"><option value="">Choose a mood</option><option>Good</option><option>Calm</option><option>Tired</option><option>Stressed</option><option>Frustrated</option></select>
        <p class="small">Your entries are saved on this device.</p>
        <button type="button" id="mcEveningSave">Save journal</button>
      </section>
      <section id="mcEvening-recap" hidden><p id="mcEveningRecap"></p><p id="mcEveningUnlock" class="small" hidden>Unlock the goblin recap by reading or journaling on three different days.</p></section>
      <p id="mcEveningStatus" class="small" role="status"></p>`;
    document.body.append(dialog);
    window.MarineLearning?.mount();
    byId('mcEveningOpen').onclick = () => open();
    dialog.querySelectorAll('[data-evening-tab]').forEach(tab => { tab.onclick = () => select(tab.dataset.eveningTab); });
    dialog.onclose = () => {
      byId('mcEveningClip').querySelector('video')?.pause();
      clearInterval(ticker);
      ticker = undefined;
    };
    byId('mcEveningDate').onchange = event => {
      const key = event.target.value;
      const stored = read().days[draftDate]?.journal;
      const edited = prompts.some((_, index) => byId('mcEveningAnswer' + index).value.trim() !== (stored?.answers?.[index] || '')) ||
        byId('mcEveningMood').value !== (stored?.mood || '');
      if (edited && !confirm('Switch dates and discard the unsaved edits?')) { event.target.value = draftDate; return; }
      loadJournal(key);
    };
    byId('mcEveningStart').onclick = () => change(data => {
      if (!data.timer) data.timer = { date: dateKey(), endsAt: Date.now() + duration };
    });
    byId('mcEveningCancel').onclick = () => change(data => { delete data.timer; });
    byId('mcEveningLog').onclick = () => {
      const data = read();
      if (!data.timer || data.timer.endsAt > Date.now()) return;
      if (change(latest => {
        if (!latest.timer || latest.timer.endsAt > Date.now()) return;
        const day = latest.days[latest.timer.date] ||= {};
        day.reading = true;
        latest.checkpoint = byId('mcEveningCheckpoint').value.trim();
        delete latest.timer;
      })) byId('mcEveningStatus').textContent = 'Reading logged.';
    };
    byId('mcEveningSave').onclick = () => {
      const answers = prompts.map((_, index) => byId('mcEveningAnswer' + index).value.trim());
      if (!answers.some(Boolean)) {
        byId('mcEveningStatus').textContent = 'Write at least one sentence to save an entry.';
        return;
      }
      if (change(data => {
        const day = data.days[draftDate] ||= {};
        day.journal = { answers, mood: byId('mcEveningMood').value };
      })) byId('mcEveningStatus').textContent = 'Journal saved.';
    };
    byId('mcEveningVideo').ontoggle = event => {
      if (!event.target.open) byId('mcEveningClip').querySelector('video')?.pause();
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    byId('mcEveningOpen').addEventListener('focus', render);
    window.addEventListener('storage', render);
    window.addEventListener('marine-backup-restored', () => {
      if (draftDate) loadJournal(draftDate);
      byId('mcEveningCheckpoint').value = read().checkpoint || '';
      render();
    });
    render();
    if (new URLSearchParams(location.search).get('mission') === 'evening') open();
  }

  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'marine-evening-reminder') open();
  });
  document.addEventListener('DOMContentLoaded', init);
})();
