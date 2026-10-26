/* Рассылка: выбор лидов → очередь с готовыми сообщениями → отправка по одному */
const DEFAULT_TPL = [
  { id: 't1', name: 'Первое касание', text: 'Здравствуйте! Меня зовут {{my_name}}. Нашёл(ла) «{{name}}» на карте {{city}}. Я {{offer}}. Могу бесплатно подготовить короткий разбор, как вам получать больше клиентов из интернета. Интересно?' },
  { id: 't2', name: 'Напоминание', text: 'Здравствуйте! Напомню о себе — писал(а) недавно насчёт «{{name}}». Могу за 10 минут показать 2–3 идеи, без обязательств. Удобно на этой неделе?' },
  { id: 't3', name: 'Последнее касание', text: 'Здравствуйте! Не хочу надоедать, поэтому пишу последний раз. Если тема станет актуальной — просто ответьте на это сообщение, и я пришлю идеи для «{{name}}». Хорошего дня!' },
];
const TPL_KEY = 'lf_templates_' + Auth.user.id;
let templates = LS.get(TPL_KEY, null) || Team.get().templates || DEFAULT_TPL;
let queue = [], idx = 0, sentCount = 0;
const preset = new URLSearchParams(location.search).get('filter'); if (preset) $('#filter').value = preset;

function candidates() {
  const f = $('#filter').value; const others = $('#showOthers').checked;
  const all = DB.all().filter(l => others || !ownedByOther(l));
  if (f === 'due') return dueLeads().filter(l => others || !ownedByOther(l));
  if (f === 'all') return all.filter(l => l.status !== 'lost' && l.status !== 'won');
  return all.filter(l => l.status === f);
}
function renderPick() {
  const ch = $('#channel').value; const list = candidates().sort((a, z) => z.score - a.score);
  const box = $('#pickList');
  if (!list.length) { box.innerHTML = `<div class="empty" style="padding:24px"><p>В этом списке никого нет.</p><a class="btn" href="leads.html">Найти лидов</a></div>`; updateInfo(); return; }
  box.innerHTML = list.map(l => { const ok = hasChannel(l, ch);
    return `<label class="pick ${ok ? '' : 'off'}"><input type="checkbox" class="pk" value="${l.id}" ${ok && $('#pickAll').checked ? 'checked' : ''} ${ok ? '' : 'disabled'}>
      <span class="grow"><b>${esc(l.name)}</b><br><span class="small muted">${ok ? esc(ch === 'email' ? l.email : (l.telegram || l.whatsapp || l.phone)) : 'нет контакта для ' + CH_LABEL[ch]}</span></span>
      ${ownerBadge(l)}${l.draft ? '<span class="badge info">черновик</span>' : ''}<span class="score ${scoreClass(l.score)}">${l.score}</span></label>`; }).join('');
  $$('.pk', box).forEach(c => c.onchange = updateInfo); updateInfo();
}
function updateInfo() { const n = $$('.pk:checked').length; $('#start').disabled = !n; $('#startInfo').textContent = n ? `Выбрано: ${n}` : 'Выберите хотя бы одного лида'; }

function renderTplSelect() { $('#tplSel').innerHTML = templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join(''); $('#tplText').value = templates[0]?.text || ''; }
$('#tplSel').onchange = () => { $('#tplText').value = templates.find(t => t.id === $('#tplSel').value)?.text || ''; };
$('#tplSave').onclick = () => { const t = templates.find(t => t.id === $('#tplSel').value); if (t) { t.text = $('#tplText').value; LS.set(TPL_KEY, templates); toast('Шаблон сохранён'); } };
$('#tplNew').onclick = () => { const name = prompt('Название шаблона'); if (!name) return; const t = { id: 't' + Date.now(), name, text: $('#tplText').value }; templates.push(t); LS.set(TPL_KEY, templates); renderTplSelect(); $('#tplSel').value = t.id; $('#tplText').value = t.text; };
$$('.vars code').forEach(c => c.onclick = () => { const ta = $('#tplText'); const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + c.textContent + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = p + c.textContent.length; });
$$('[name=mode]').forEach(r => r.onchange = () => { const tpl = $('[name=mode]:checked').value === 'tpl'; $('#tplBox').hidden = !tpl; $('#aiBox').hidden = tpl; });
$('#filter').onchange = () => { if ($('#filter').value === 'due' && templates[1]) { $('#tplSel').value = templates[1].id; $('#tplSel').onchange(); } renderPick(); };
$('#channel').onchange = renderPick; $('#pickAll').onchange = renderPick; $('#showOthers').onchange = renderPick;
window.addEventListener('lf-data', () => { if (!$('#setup').hidden) renderPick(); });

$('#start').onclick = () => {
  queue = $$('.pk:checked').map(c => c.value); idx = 0; sentCount = 0;
  if (!queue.length) return;
  $('#setup').hidden = true; $('#runner').hidden = false; showCurrent();
};

async function showCurrent() {
  const r = $('#runner'); const ch = $('#channel').value;
  requestAnimationFrame(() => replay(r, 'slide-next'));
  if (idx >= queue.length) {
    r.innerHTML = `<div class="empty"><h3>Готово: отправлено ${sentCount} из ${queue.length}</h3><p>Напоминания поставлены через ${Settings.get().followupDays} дн. — они появятся в CRM и здесь в списке «Пора напомнить».</p>
      <div class="row gap" style="justify-content:center"><a class="btn primary" href="crm.html">Открыть CRM</a><button class="btn" id="again">Новая рассылка</button></div></div>`; $('#again').onclick = () => location.reload(); return;
  }
  const l = DB.get(queue[idx]); if (!l) { idx++; return showCurrent(); }
  if (ownedByOther(l) && !$('#showOthers').checked) { toast(`«${l.name}» уже взял(а) ${l.ownerName} — пропускаю`); idx++; return showCurrent(); }
  r.innerHTML = `<div class="row gap"><b>${idx + 1} / ${queue.length}</b><div class="progress"><i style="width:${(idx / queue.length) * 100}%"></i></div><button class="btn" id="rStop">Завершить</button></div>
    <div><h2 style="margin:8px 0 2px">${esc(l.name)}</h2><div class="muted small">${esc(CATS[l.category]?.label || '')} · ${esc(l.city || '')} ${l.address ? '· ' + esc(l.address) : ''}</div>
    <div class="contacts" style="margin-top:8px">${contactBadges(l)}<span class="score ${scoreClass(l.score)}">${l.score}</span></div></div>
    <label>Сообщение<textarea id="rMsg" rows="8" disabled>ИИ пишет сообщение…</textarea></label>
    <div class="row gap wrap-row"><button class="btn primary big" id="rSend" disabled>Отправить в ${CH_LABEL[ch]}</button><button class="btn" id="rRegen">Написать заново</button><button class="btn" id="rCopy">Скопировать</button><button class="btn" id="rSkip">Пропустить</button><span class="small muted" id="rSrc"></span></div>
    <p class="small muted" style="margin:0">После отправки вернитесь на эту вкладку — откроется следующий лид.</p>`;
  $('#rStop').onclick = () => { idx = queue.length; showCurrent(); };
  $('#rSkip').onclick = () => { idx++; showCurrent(); };
  $('#rCopy').onclick = async () => toast(await copyText($('#rMsg').value) ? 'Скопировано' : 'Не удалось скопировать');
  $('#rRegen').onclick = () => fill(l, ch, true);
  $('#rSend').onclick = async () => {
    const text = $('#rMsg').value.trim(); if (!text) { toast('Сообщение пустое', 'error'); return; }
    if (await sendVia(DB.get(l.id), ch, text)) { sentCount++; idx++; showCurrent(); }
  };
  fill(l, ch, false);
}
async function fill(l, ch, regen) {
  const ta = $('#rMsg'); ta.disabled = true; $('#rSend').disabled = true; $('#rSrc').innerHTML = '<span class="spin"></span>';
  let text, src;
  if ($('[name=mode]:checked').value === 'tpl') { text = renderTemplate($('#tplText').value, l); src = 'По шаблону'; }
  else if (l.draft && !regen) { text = l.draft; src = 'Черновик от ИИ-агента'; }
  else { ta.value = 'ИИ пишет сообщение…'; const lv = $('#lang').value; const co = COUNTRIES[l.country || cityCountry(l.city)];
    const lang = lv !== 'auto' ? lv : (co && co.langs.includes(Settings.get().lang) ? Settings.get().lang : co ? 'ru' : Settings.get().lang);
    const r = await writeMessage(l, ch, { followup: (l.touches || 0) > 0, lang }); text = r.text; src = r.source === 'ai' ? 'Написано ИИ' : `Шаблон — ИИ недоступен (${r.error})`; DB.update(l.id, { draft: text }); }
  if (!$('#rMsg') || queue[idx] !== l.id) return;
  if (ch === 'email' && !/^Тема:/.test(text)) text = `Тема: Идея для «${l.name}»\n\n` + text;
  ta.value = text; ta.disabled = false; $('#rSend').disabled = false; $('#rSrc').textContent = src;
}

renderTplSelect(); renderPick();
