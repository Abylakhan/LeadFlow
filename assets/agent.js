/* ИИ-агент: модель решает, какие действия выполнить в CRM, страница их выполняет */
const CHAT_KEY = 'lf_chat_' + Auth.user.id;
let chat = LS.get(CHAT_KEY, []);
let busy = false;
const CHIPS = ['Найди 20 кофеен в моём городе', 'Напиши сообщения всем новым лидам', 'Что мне сделать сегодня?', 'Клиент говорит «дорого» — что ответить?', 'Покажи лидов без сайта'];

function fmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
function render(pending = '') {
  const el = $('#chat');
  const welcome = `<div class="msg"><div class="bubble">Привет! Я ИИ-агент LeadFlow. Скажите, каких клиентов ищем — например, <b>«найди 30 салонов красоты в Шымкенте»</b> — и я найду их, добавлю в CRM и подготовлю сообщения.</div></div>`;
  el.innerHTML = (chat.length ? chat.map(m => `<div class="msg ${m.role}"><div class="bubble">${m.html || fmt(m.content)}</div></div>`).join('') : welcome)
    + (pending ? `<div class="msg typing"><div class="bubble"><span class="dots3" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(pending)}</div></div>` : '');
  el.scrollTop = el.scrollHeight;
}
function push(role, content, html) { chat.push({ role, content, ...(html ? { html } : {}) }); chat = chat.slice(-60); LS.set(CHAT_KEY, chat); render(); }

function systemPrompt() {
  const s = Settings.get(); const all = DB.all();
  return `Ты — ИИ-агент по продажам внутри бесплатной CRM LeadFlow. Помогаешь пользователю находить клиентов (B2B, малый бизнес), писать им и доводить до сделки. Отвечаешь по-русски, кратко и по делу.
Пользователь: ${s.myName || 'имя не указано'} (в команде до 10 человек, лиды закрепляются за сотрудником, чужих лидов не трогай)${s.company ? ', ' + s.company : ''}. Его предложение: ${s.offer}. Город по умолчанию: ${s.city}. Сегодня: ${today()}.
CRM: всего ${all.length} лидов (${STATUSES.map(x => `${x.label}: ${all.filter(l => l.status === x.id).length}`).join(', ')}). Пора напомнить: ${dueLeads().length}.
Последние лиды (id | название | статус):
${all.slice(0, 20).map(l => `${l.id} | ${l.name} | ${l.status} | ${l.owner ? (isMine(l) ? 'мой' : 'ведёт ' + l.ownerName) : 'свободен'}`).join('\n') || '—'}

Доступные действия:
- search_leads {"category": ключ, "city": "город", "limit": число до 100} — найти компании на карте и добавить в CRM. Ключи category: ${Object.entries(CATS).map(([k, c]) => `${k} (${c.label})`).join(', ')}
- draft_messages {"status": "new"|"contacted"|"replied", "channel": "whatsapp"|"email"|"telegram", "limit": число до 15} — написать персональные черновики
- set_status {"id": "id лида", "status": "new"|"contacted"|"replied"|"meeting"|"won"|"lost"}
- add_note {"id": "id лида", "text": "заметка"}
- show_leads {"status": статус или "", "no_website": true|false}
- plan_today {}

Отвечай СТРОГО одним JSON-объектом без markdown:
{"reply": "текст для пользователя", "actions": [{"type": "search_leads", "category": "cafe", "city": "Алматы", "limit": 20}]}
Если действие не нужно (совет, скрипт, ответ на возражение) — "actions": []. Не выдумывай результаты действий: их покажет система.`;
}

function parsePlan(raw) {
  const t = String(raw).replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const j = JSON.parse(t.slice(a, b + 1)); return { reply: String(j.reply || ''), actions: Array.isArray(j.actions) ? j.actions : [] }; } catch { /* текст без JSON */ } }
  return { reply: t, actions: [] };
}

/* Без ИИ: понимаем базовые команды правилами */
function ruleAgent(text) {
  const t = text.toLowerCase();
  const city = (text.match(/(?:^|\s)во?\s+([А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]+(?:[\s-][А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]+)?)/) || [])[1];
  if (/найд|найти|поиск|ищи|собери|подбер/.test(t)) {
    const cat = detectCategory(t) || 'cafe'; const n = parseInt((t.match(/\d+/) || [])[0]) || 20;
    return { reply: '', actions: [{ type: 'search_leads', category: cat, city: city && !/моём|моем/.test(city) ? city : Settings.get().city, limit: n }] };
  }
  if (/напиш|сообщен|письм|черновик/.test(t)) return { reply: '', actions: [{ type: 'draft_messages', status: /напомн|повтор/.test(t) ? 'contacted' : 'new', channel: /почт|email|письм/.test(t) ? 'email' : 'whatsapp', limit: 10 }] };
  if (/план|сегодня|что делать|что мне/.test(t)) return { reply: '', actions: [{ type: 'plan_today' }] };
  if (/покаж|список|лиды|без сайта/.test(t)) return { reply: '', actions: [{ type: 'show_leads', status: '', no_website: /без сайта/.test(t) }] };
  if (/дорого/.test(t)) return { reply: 'Попробуйте так: «Понимаю. Давайте посчитаем: если сайт приведёт хотя бы 2–3 новых клиента в месяц, он окупится за первый месяц. Могу показать примеры у похожих компаний — 10 минут, удобно завтра?»', actions: [] };
  return { reply: 'Сейчас ИИ-модель недоступна, но базовые команды я понимаю: «найди 20 кофеен в Алматы», «напиши сообщения новым лидам», «план на сегодня», «покажи лидов без сайта». Чтобы агент отвечал свободно, подключите бесплатный ключ в Настройках.', actions: [] };
}

function leadList(list) {
  return `<ul>${list.slice(0, 10).map(l => `<li><a href="crm.html?lead=${encodeURIComponent(l.id)}">${esc(l.name)}</a> · ${statusLabel(l.status)} · ${l.score}${!l.website ? ' · без сайта' : ''}</li>`).join('')}</ul>${list.length > 10 ? `<div class="small">и ещё ${list.length - 10} — <a href="crm.html">в CRM</a></div>` : ''}`;
}
function findLead(a) {
  const all = DB.all();
  return all.find(l => l.id === a.id) || all.find(l => a.name && l.name.toLowerCase().includes(String(a.name).toLowerCase())) || all.find(l => a.id && l.name.toLowerCase().includes(String(a.id).toLowerCase()));
}

async function runAction(a) {
  switch (a.type) {
    case 'search_leads': {
      const category = CATS[a.category] ? a.category : (detectCategory(a.category) || 'cafe');
      const city = a.city || Settings.get().city; const limit = Math.min(Math.max(parseInt(a.limit) || 20, 1), 100);
      render(`Ищу «${CATS[category].label}» в ${city} на карте…`);
      const found = await searchLeads({ category, city, limit });
      const added = DB.add(found);
      const noSite = found.filter(l => !l.website).length;
      const text = `Нашёл ${found.length} компаний (${CATS[category].label}, ${city}), в CRM добавлено новых: ${added}. Без сайта: ${noSite}.`;
      return { text, html: `${fmt(text)}${found.length ? leadList(found.map(f => DB.all().find(l => dedupeKey(l) === dedupeKey(f)) || f)) : ''}${found.length ? '<div class="small">Дальше: «напиши сообщения новым лидам».</div>' : ''}` };
    }
    case 'draft_messages': {
      const status = a.status || 'new'; const ch = ['whatsapp', 'email', 'telegram'].includes(a.channel) ? a.channel : 'whatsapp';
      const limit = Math.min(Math.max(parseInt(a.limit) || 10, 1), 15);
      const list = (status === 'due' ? dueLeads() : DB.all().filter(l => l.status === status)).filter(l => hasChannel(l, ch) && !l.draft && !ownedByOther(l)).sort((x, z) => z.score - x.score).slice(0, limit);
      if (!list.length) return { text: `Нет лидов со статусом «${statusLabel(status)}» с контактом ${CH_LABEL[ch]} без черновика.` };
      let ai_ = 0;
      for (let i = 0; i < list.length; i++) {
        render(`Пишу черновики: ${i + 1} из ${list.length} — ${list[i].name}`);
        const r = await writeMessage(list[i], ch, { followup: (list[i].touches || 0) > 0 });
        if (r.source === 'ai') ai_++;
        DB.update(list[i].id, { draft: r.text });
      }
      const text = `Готово: ${list.length} черновиков для ${CH_LABEL[ch]} (${ai_} написал ИИ, ${list.length - ai_} — по шаблону).`;
      return { text, html: `${fmt(text)}<br>Пример для <b>${esc(list[0].name)}</b>:<br><i>${fmt(DB.get(list[0].id).draft.slice(0, 400))}</i><br><a href="outreach.html?filter=${esc(status)}">Открыть очередь отправки →</a>` };
    }
    case 'set_status': {
      const l = findLead(a); if (!l || !STATUSES.some(s => s.id === a.status)) return { text: 'Не нашёл такого лида или статуса.' };
      if (ownedByOther(l) && Auth.user.role !== 'admin') return { text: `«${l.name}» ведёт ${l.ownerName} — менять его статус может только он(а).` };
      DB.update(l.id, { status: a.status }); DB.log(l.id, 'status', `Статус → ${statusLabel(a.status)} (агент)`);
      return { text: `«${l.name}» → ${statusLabel(a.status)}.` };
    }
    case 'add_note': {
      const l = findLead(a); if (!l) return { text: 'Не нашёл такого лида.' };
      if (ownedByOther(l) && Auth.user.role !== 'admin') return { text: `«${l.name}» ведёт ${l.ownerName} — заметки к нему добавляет только он(а).` };
      DB.update(l.id, { notes: [l.notes, String(a.text || '').slice(0, 1000)].filter(Boolean).join('\n') });
      return { text: `Заметка добавлена к «${l.name}».` };
    }
    case 'show_leads': {
      let list = DB.all(); if (a.status) list = list.filter(l => l.status === a.status); if (a.no_website) list = list.filter(l => !l.website);
      list.sort((x, z) => z.score - x.score);
      const text = list.length ? `Лидов: ${list.length}.` : 'Таких лидов нет. Скажите «найди…», чтобы добавить.';
      return { text, html: fmt(text) + (list.length ? leadList(list) : '') };
    }
    case 'plan_today': {
      const all = DB.all(); const due = dueLeads(true); const fresh = all.filter(l => l.status === 'new' && isFree(l)); const rep = all.filter(l => l.status === 'replied' && isMine(l)); const meet = all.filter(l => l.status === 'meeting' && isMine(l));
      const lines = [];
      if (rep.length) lines.push(`1. Ответить тем, кто написал (${rep.length}) — это самые горячие: ${rep.slice(0, 3).map(l => l.name).join(', ')}. Предложите короткий созвон.`);
      if (meet.length) lines.push(`${lines.length + 1}. Подготовиться к встречам (${meet.length}): ${meet.slice(0, 3).map(l => l.name).join(', ')}.`);
      if (due.length) lines.push(`${lines.length + 1}. Напомнить о себе (${due.length}) — раздел «Рассылка» → «Пора напомнить».`);
      if (fresh.length) lines.push(`${lines.length + 1}. Написать новым лидам: возьмите ${Math.min(20, fresh.length)} лучших из ${fresh.length}.`);
      if (!lines.length) lines.push('1. Найти новых лидов: скажите «найди 30 … в …».');
      lines.push('Цель на день: 20 первых сообщений + все напоминания. Обычно отвечает 5–15%.');
      const text = 'План на сегодня:\n' + lines.join('\n');
      return { text };
    }
    default: return { text: `Неизвестное действие: ${a.type}` };
  }
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true; $('#sendBtn').disabled = true;
  push('user', text.trim());
  render('Думаю…');
  let plan, offline = '';
  try {
    const msgs = [{ role: 'system', content: systemPrompt() }, ...chat.slice(-14).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))];
    plan = parsePlan(await ai(msgs, { temperature: 0.3 }));
  } catch (e) { plan = ruleAgent(text); offline = e.message; }
  if (plan.reply) push('assistant', plan.reply);
  for (const a of plan.actions.slice(0, 4)) {
    try { const r = await runAction(a); push('assistant', r.text, r.html); }
    catch (e) { push('assistant', `Не получилось выполнить действие: ${e.message}`); }
  }
  if (!plan.reply && !plan.actions.length) push('assistant', 'Не понял задачу. Попробуйте: «найди 20 кофеен в Алматы».');
  if (offline) toast(`ИИ недоступен (${offline}) — работаю по базовым командам`, 'error');
  busy = false; $('#sendBtn').disabled = false; render(); $('#msg').focus();
}

$('#chips').innerHTML = CHIPS.map(c => `<button class="chip" type="button">${esc(c)}</button>`).join('');
$$('.chip').forEach(b => b.onclick = () => send(b.textContent));
$('#chatForm').onsubmit = e => { e.preventDefault(); const v = $('#msg').value; $('#msg').value = ''; $('#msg').style.height = ''; send(v); };
$('#msg').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } };
$('#msg').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; };
$('#clear').onclick = () => { if (confirm('Очистить историю чата с агентом? Лиды в CRM останутся.')) { chat = []; LS.set(CHAT_KEY, chat); render(); } };
render();
