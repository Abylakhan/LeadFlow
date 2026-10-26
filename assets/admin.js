/* Админка: команда, общие настройки ИИ, контакты, цены, примеры, данные, подключение облака */
{
  const clone = v => JSON.parse(JSON.stringify(v));
  let site = clone(Site.get()), team = clone(Team.get());
  let tab = (location.hash.slice(1) || 'team'), dirty = false;

  const TEXT = {
    contacts: { src: () => (site.contacts = site.contacts || {}), fields: [
      ['whatsapp', 'WhatsApp (основной номер)', '+7 747 154 1449'], ['phone2', 'Второй номер', '+7 700 274 4252'],
      ['telegram', 'Telegram (личный)', '@username'], ['tgChannel', 'Telegram-канал', '@channel'], ['tgBot', 'Telegram-бот', '@my_bot'],
      ['instagram', 'Instagram', '@username'], ['tiktok', 'TikTok', '@username'], ['email', 'Email', 'mail@example.com'],
      ['kaspi', 'Kaspi (для оплаты)', '+7 …'], ['portfolio', 'Ссылка на портфолио — ИИ вставляет её в сообщения клиентам', 'https://…'],
      ['waText', 'Первое сообщение, когда клиент нажимает WhatsApp на сайте', 'Здравствуйте!…', true]] },
    brand: { src: () => (site.brand = site.brand || {}), fields: [
      ['name', 'Имя или название студии', 'Nurbolat'], ['title', 'Заголовок страницы цен', 'Сайты для бизнеса'], ['area', 'Плашка над заголовком (где работаете)', 'Казахстан · Узбекистан · Кыргызстан'],
      ['tagline', 'Подзаголовок', '', true], ['about', 'О себе', '', true], ['priceNote', 'Примечание к ценам', '', true]] },
    ai: { src: () => team, fields: [
      ['company', 'Название команды или студии (подпись в письмах)', 'Nurbolat Studio'], ['offer', 'Что предлагаем клиентам — ИИ опирается на это', '', true],
      ['city', 'Город поиска по умолчанию', 'Алматы'], ['followupDays', 'Напоминать написать повторно через, дней', '3'], ['dailyGoal', 'Цель: сообщений в день на сотрудника', '20']] },
  };
  const LISTS = {
    packs: { title: 'Пакеты и цены', cols: '1.4fr 110px 110px 110px 2fr auto', fields: [['name', 'Название'], ['price', 'Цена от, ₸', 'num'], ['max', 'Цена до, ₸', 'num'], ['days', 'Срок'], ['note', 'Описание', 'wide']] },
    addons: { title: 'Дополнительные услуги', cols: '1.4fr 120px 90px 2fr auto', fields: [['name', 'Название'], ['price', 'Цена, ₸', 'num'], ['unit', 'За (мес)'], ['note', 'Описание', 'wide']] },
    payments: { title: 'Способы оплаты — видны клиентам на странице цен', cols: '120px 1fr 1fr 1fr 1fr 1.4fr auto', fields: [['country', 'Страна'], ['name', 'Способ'], ['details', 'Номер / карта'], ['holder', 'Получатель'], ['link', 'Ссылка на оплату'], ['note', 'Подсказка', 'wide']] },
    promo: { title: 'Продвижение и ИИ-видео', cols: '1.4fr 120px 90px 2fr auto', fields: [['name', 'Название'], ['price', 'Цена, ₸', 'num'], ['unit', 'За (мес)'], ['note', 'Описание', 'wide']] },
    demos: { title: 'Примеры работ', cols: '1fr 1.5fr 1.5fr auto', fields: [['name', 'Ниша'], ['url', 'Ссылка', 'wide'], ['desc', 'Описание', 'wide']] },
  };
  const TABS = [['team', 'Команда'], ['ai', 'ИИ'], ['contacts', 'Контакты'], ['brand', 'О себе'], ['packs', 'Цены'], ['addons', 'Доп. услуги'], ['promo', 'Продвижение'], ['demos', 'Примеры'], ['payments', 'Оплата'], ['data', 'Данные'], ['cloud', 'Облако']];
  const EDITABLE = new Set(['ai', 'contacts', 'brand', 'packs', 'addons', 'promo', 'demos', 'payments']);

  function mark() { dirty = true; $('#state').textContent = 'Есть несохранённые изменения'; }
  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-t="${k}">${t}</button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); renderTabs(); renderPanel(); });
    $('#savebar').hidden = !EDITABLE.has(tab);
  }

  function renderPanel() {
    const p = $('#panel'); replay(p);
    if (tab === 'team') return renderTeam(p);
    if (tab === 'data') return renderData(p);
    if (tab === 'cloud') return renderCloud(p);
    if (TEXT[tab]) {
      const obj = TEXT[tab].src();
      p.innerHTML = `<section class="card stack">${TEXT[tab].fields.map(([k, label, ph, long]) => `<label>${label}${long
        ? `<textarea data-k="${k}" rows="3" placeholder="${esc(ph)}">${esc(obj[k] ?? '')}</textarea>`
        : `<input data-k="${k}" value="${esc(obj[k] ?? '')}" placeholder="${esc(ph)}">`}</label>`).join('')}
        ${tab === 'ai' ? `<label class="check"><input type="checkbox" id="aiNoSite" ${team.preferNoWebsite ? 'checked' : ''}> Поднимать в поиске компании без сайта (вы продаёте сайты)</label>` + aiBlock() : ''}
        ${tab === 'contacts' ? '<p class="small muted" style="margin:0">Пустые поля на сайте не показываются. Номер можно писать в любом виде: +7 747 154 1449 или 87471541449.</p>' : ''}</section>`;
      $$('[data-k]', p).forEach(i => i.oninput = () => { obj[i.dataset.k] = i.dataset.k === 'followupDays' ? Math.min(60, Math.max(1, +i.value || 3)) : i.dataset.k === 'dailyGoal' ? Math.min(200, Math.max(1, +i.value || 20)) : i.value; mark(); });
      if (tab === 'ai') bindAi(p);
      return;
    }
    const L = LISTS[tab]; const arr = site[tab] = site[tab] || [];
    const terms = site.payTerms = site.payTerms || { prepay: 50, steps: [], note: '' };
    p.innerHTML = (tab === 'payments' ? `<section class="card stack" style="margin-bottom:14px"><h3 style="margin:0">Условия оплаты</h3>
      <label>Предоплата, %<input type="number" id="tPre" min="0" max="100" value="${+terms.prepay || 0}" style="width:120px"></label>
      <label>Шаги оплаты (каждый с новой строки)<textarea id="tSteps" rows="4">${esc((terms.steps || []).join('\n'))}</textarea></label>
      <label>Примечание<textarea id="tNote" rows="2">${esc(terms.note || '')}</textarea></label>
      <p class="small muted" style="margin:0">Если номер не указан, клиент увидит кнопку «Запросить реквизиты» в WhatsApp. Не публикуйте здесь пароли и коды из SMS.</p></section>` : '') + `<section class="card"><div class="row gap" style="justify-content:space-between"><h3 style="margin:0">${L.title}</h3><button class="btn" id="addRow">Добавить</button></div>
      <div>${arr.map((it, i) => `<div class="adm-row" style="--cols:${L.cols}" data-i="${i}">
        ${L.fields.map(([k, label, kind]) => `<label class="${kind === 'wide' ? 'wide' : ''}">${label}<input data-f="${k}" ${kind === 'num' ? 'type="number" min="0" step="1000"' : ''} value="${esc(it[k] ?? '')}"></label>`).join('')}
        <div class="adm-actions"><button class="icon-btn" data-a="up" aria-label="Выше" title="Выше">↑</button><button class="icon-btn" data-a="down" aria-label="Ниже" title="Ниже">↓</button><button class="icon-btn" data-a="del" aria-label="Удалить «${esc(it.name || '')}»" title="Удалить">✕</button></div>
      </div>`).join('') || '<div class="empty">Список пуст — нажмите «Добавить».</div>'}</div></section>`;
    $$('.adm-row', p).forEach(r => {
      const i = +r.dataset.i;
      $$('[data-f]', r).forEach(inp => inp.oninput = () => { arr[i][inp.dataset.f] = inp.type === 'number' ? (+inp.value || 0) : inp.value; mark(); });
      $$('[data-a]', r).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'del') { if (!confirm(`Удалить «${arr[i].name || 'без названия'}»?`)) return; arr.splice(i, 1); }
        if (a === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        if (a === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        mark(); renderPanel();
      });
    });
    if (tab === 'payments') { $('#tPre').oninput = e => { terms.prepay = Math.min(100, Math.max(0, +e.target.value || 0)); mark(); }; $('#tSteps').oninput = e => { terms.steps = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8); mark(); }; $('#tNote').oninput = e => { terms.note = e.target.value; mark(); }; }
    $('#addRow').onclick = () => { arr.push(Object.fromEntries(L.fields.map(([k, , kind]) => [k, kind === 'num' ? 0 : '']))); mark(); renderPanel(); $$('.adm-row').at(-1)?.querySelector('input')?.focus(); };
  }

  /* ИИ: ключи с автоматической сменой */
  function aiBlock() {
    return `<hr><div class="row gap wrap-row" style="justify-content:space-between"><div><h3 style="margin:0">Ключи ИИ</h3>
      <p class="small muted" style="margin:0">Добавьте несколько бесплатных ключей. Когда один упирается в дневной лимит, система сама переключается на следующий, а потом возвращается к нему. ${Cloud.on ? 'Ключи хранятся на сервере — сотрудники их не видят.' : 'В демо-режиме ключи хранятся в этом браузере.'}</p></div>
      <button type="button" class="btn" id="aiTestAll">Проверить ИИ</button></div>
      <span class="small" id="aiRes"></span>
      <form id="keyForm" class="key-form">
        <label class="grow">Вставьте ключ<input id="kKey" type="password" autocomplete="off" spellcheck="false" placeholder="AIza… / gsk_… / csk-… / sk-or-…"></label>
        <label>Сервис<select id="kProv"><option value="">определить сам</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
        <button class="btn primary">Добавить ключ</button>
      </form>
      <div class="key-help small">${Object.values(PROVIDERS).map(v => `<a href="${v.keyUrl}" target="_blank" rel="noopener">${v.label}</a> — ${v.hint}`).join('<br>')}</div>
      <div id="keysList"><div class="skeleton"></div></div>
      ${Cloud.on ? `<details class="small"><summary>Серверная функция ИИ (один раз)</summary><p class="muted">Supabase → Edge Functions → Deploy a new function → Via Editor → имя <code>ai</code> → вставьте код из <a href="supabase/functions/ai/index.ts" target="_blank">supabase/functions/ai/index.ts</a> → Deploy.</p></details>` : ''}`;
  }
  const keyState = k => k.disabled ? '<span class="badge bad">не работает</span>'
    : k.cooldown_until && new Date(k.cooldown_until) > Date.now() ? `<span class="badge warn">пауза до ${new Date(k.cooldown_until).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>`
    : k.last_used_at ? '<span class="badge ok">работает</span>' : '<span class="badge">не проверен</span>';
  async function renderKeys() {
    const box = $('#keysList'); if (!box) return;
    let keys; try { keys = await AIKeys.list(); } catch (e) { box.innerHTML = `<p class="form-err">${esc(e.message)}</p>`; return; }
    if (!keys.length) { box.innerHTML = '<div class="empty" style="padding:20px"><b>Ключей пока нет.</b><br>Без ключа сообщения пишутся по шаблону. Ключ Gemini получается за минуту: войдите через Google и нажмите «Create API key».</div>'; return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Сервис</th><th>Ключ</th><th>Состояние</th><th>Запросов</th><th></th></tr></thead><tbody>${keys.map(k => `<tr data-key-id="${k.id}">
      <td><b>${esc(PROVIDERS[k.provider]?.label || k.provider)}</b>${k.label ? `<div class="small muted">${esc(k.label)}</div>` : ''}</td>
      <td><code>${esc(k.masked)}</code></td>
      <td>${keyState(k)}${k.last_error ? `<div class="small muted" title="${esc(k.last_error)}">${esc(k.last_error.slice(0, 70))}</div>` : ''}</td>
      <td>${k.uses || 0}${k.fails ? ` <span class="small muted">/ ошибок ${k.fails}</span>` : ''}</td>
      <td><div class="row gap"><button type="button" class="btn" data-a="test">Проверить</button><button type="button" class="btn" data-a="toggle">${k.disabled ? 'Включить' : 'Выключить'}</button><button type="button" class="icon-btn" data-a="del" aria-label="Удалить ключ ${esc(k.masked)}" title="Удалить">✕</button></div></td></tr>`).join('')}</tbody></table></div>`;
    $$('tr[data-key-id]', box).forEach(tr => {
      const k = keys.find(x => String(x.id) === tr.dataset.keyId);
      $('[data-a=test]', tr).onclick = async e => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>'; try { await AIKeys.test(k.id); toast('Ключ работает'); } catch (x) { toast(x.message, 'error'); } renderKeys(); };
      $('[data-a=toggle]', tr).onclick = async () => { try { await AIKeys.setDisabled(k.id, !k.disabled); } catch (x) { toast(x.message, 'error'); } renderKeys(); };
      $('[data-a=del]', tr).onclick = async () => { if (!confirm(`Удалить ключ ${PROVIDERS[k.provider]?.label} ${k.masked}?`)) return; try { await AIKeys.remove(k.id); toast('Ключ удалён'); } catch (x) { toast(x.message, 'error'); } renderKeys(); };
    });
  }
  function bindAi(p) {
    $('#aiNoSite', p).onchange = e => { team.preferNoWebsite = e.target.checked; mark(); };
    $('#kKey', p).oninput = e => { const g = guessProvider(e.target.value); if (g) $('#kProv', p).value = g; };
    $('#keyForm', p).onsubmit = async e => {
      e.preventDefault(); const b = $('button.primary', e.target); b.disabled = true;
      try { await AIKeys.add({ provider: $('#kProv', p).value, key: $('#kKey', p).value }); e.target.reset(); toast('Ключ добавлен — проверяю…'); await renderKeys(); const keys = await AIKeys.list(); const last = keys[keys.length - 1]; try { await AIKeys.test(last.id); toast('Ключ работает'); } catch (x) { toast('Ключ добавлен, но не ответил: ' + x.message, 'error'); } renderKeys(); }
      catch (x) { toast(x.message, 'error'); }
      finally { b.disabled = false; }
    };
    $('#aiTestAll', p).onclick = async () => {
      $('#aiRes').innerHTML = '<span class="spin"></span> Спрашиваю модель…';
      try { const r = await ai([{ role: 'user', content: 'Ответь одной короткой фразой по-русски: ты на связи?' }]); $('#aiRes').innerHTML = `<span class="badge ok">Работает</span> ${esc(r.slice(0, 120))}`; }
      catch (e) { $('#aiRes').innerHTML = `<span class="badge bad">Не отвечает</span> ${esc(e.message)}`; }
      renderKeys();
    };
    renderKeys();
  }

  /* Команда: заявки и сотрудники */
  const ago = iso => { if (!iso) return 'ещё не входил(а)'; const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 2 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  async function renderTeam(p) {
    p.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    let users; try { users = await Auth.listUsers(); } catch (e) { p.innerHTML = `<div class="card empty"><h3>Не удалось загрузить команду</h3><p>${esc(e.message)}</p></div>`; return; }
    const pending = users.filter(u => u.status === 'pending'), active = users.filter(u => u.status === 'active'), off = users.filter(u => u.status === 'disabled');
    const regLink = location.href.replace(/[^/]*$/, '') + 'index.html#register';
    const row = u => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b>${u.id === Auth.user.id ? ' <span class="badge ok">вы · главный</span>' : ''}<div class="small muted">${esc(u.email)}</div></td>
      <td class="small">${u.status === 'pending' ? 'заявка ' + ago(u.created_at) : ago(u.last_sign_in_at || u.last_login)}</td>
      <td>${DB.all().filter(l => l.owner === u.id).length}</td>
      <td><div class="row gap wrap-row">${u.id === Auth.user.id ? '' : u.status === 'pending'
        ? `<button class="btn primary" data-act="approve">Подтвердить</button><button class="btn danger" data-act="remove">Отклонить</button>`
        : `<button class="btn" data-act="pass">Новый пароль</button>${u.status === 'active' ? '<button class="btn" data-act="disable">Отключить</button>' : '<button class="btn" data-act="approve">Включить</button>'}<button class="btn danger" data-act="remove" aria-label="Удалить ${esc(u.name)}">Удалить</button>`}</div></td></tr>`;
    const table = (title, list, empty) => `<section class="card"><h3>${title}</h3>${list.length ? `<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Последний вход</th><th>Лидов</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : `<p class="muted" style="margin:0">${empty}</p>`}</section>`;
    p.innerHTML = `<div class="stack">
      <section class="card stack"><div class="row gap wrap-row" style="justify-content:space-between"><div><h3 style="margin:0">Пригласить сотрудника</h3><p class="small muted" style="margin:0">Отправьте ссылку. Человек сам регистрируется по email, вы подтверждаете заявку. Активных: <b>${active.length} из ${MAX_USERS}</b>.</p></div>
        <button class="btn primary" id="copyReg">Скопировать ссылку</button></div></section>
      ${pending.length ? table(`Новые заявки <span class="badge warn">${pending.length}</span>`, pending, '') : ''}
      ${table('Команда', active, 'Пока никого')}
      ${off.length ? table('Отключены', off, '') : ''}
      <p class="small muted">Пароли сотрудников не видны никому, даже администратору: они хранятся в зашифрованном виде. Если сотрудник забыл пароль, нажмите «Новый пароль» и передайте его лично.</p></div>`;
    $('#copyReg').onclick = async () => toast(await copyText(`Регистрация в CRM команды: ${regLink}`) ? 'Ссылка скопирована — отправьте её сотруднику' : regLink);
    $$('tr[data-id]', p).forEach(tr => {
      const u = users.find(x => x.id === tr.dataset.id);
      const run = async (fn, ok) => { $$('button', tr).forEach(b => b.disabled = true); try { await fn(); toast(ok); } catch (x) { toast(x.message, 'error'); } renderTeam(p); refreshBadge(); };
      const on = (a, fn) => { const b = $(`[data-act=${a}]`, tr); if (b) b.onclick = fn; };
      on('approve', () => run(() => Auth.setStatus(u.id, 'active'), `${u.name} получил(а) доступ`));
      on('disable', () => { if (confirm(`Отключить ${u.name}? Доступ пропадёт сразу, лиды останутся в базе.`)) run(() => Auth.setStatus(u.id, 'disabled'), 'Доступ отключён'); });
      on('remove', () => { if (confirm(u.status === 'pending' ? `Отклонить заявку ${u.name} (${u.email})?` : `Удалить аккаунт ${u.name}? Его лиды станут свободными. Отменить нельзя.`)) run(() => Auth.remove(u.id), u.status === 'pending' ? 'Заявка отклонена' : 'Аккаунт удалён'); });
      on('pass', async () => {
        const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const pw = [...crypto.getRandomValues(new Uint8Array(10))].map(x => a[x % a.length]).join('') + Math.floor(Math.random() * 10);
        if (!confirm(`Задать ${u.name} новый пароль? Старый перестанет работать.`)) return;
        run(async () => { await Auth.setPassword(u.id, pw); await copyText(`Новый пароль для ${u.email}: ${pw}`); alert(`Новый пароль для ${u.email}:\n\n${pw}\n\nОн скопирован — передайте его сотруднику лично. Больше он нигде не показывается.`); }, 'Пароль изменён');
      });
    });
  }

  /* Данные */
  function renderData(p) {
    const all = DB.all();
    p.innerHTML = `<section class="card stack"><h3 style="margin:0">База лидов</h3>
      <p class="muted" style="margin:0">Всего лидов: ${all.length}. Из них закреплены: ${all.filter(l => l.owner).length}.</p>
      <div class="row gap wrap-row"><button class="btn" id="dExp">Резервная копия (JSON)</button><label class="btn" style="flex-direction:row;color:var(--ink);font-size:14px">Восстановить из копии<input type="file" id="dImp" accept=".json" hidden></label><button class="btn" id="dCsv">Экспорт в Excel (CSV)</button><button class="btn" id="dDemo">Добавить демо-лиды</button></div>
      <hr><h3 style="margin:0">Освободить лидов сотрудника</h3><p class="small muted" style="margin:0">Если сотрудник ушёл, его незакрытые лиды можно вернуть в общий список.</p>
      <div class="row gap wrap-row"><select id="dWho" style="width:auto"></select><button class="btn" id="dFree">Освободить</button></div>
      ${Cloud.on ? '<hr><h3 style="margin:0">Корзина</h3><p class="small muted" style="margin:0">Удалённые лиды 30 дней хранятся в облаке, чтобы удаление дошло до всех сотрудников. Здесь их можно стереть окончательно и освободить место.</p><div><button class="btn" id="dPurge">Очистить корзину</button></div>' : ''}
      <hr><h3 style="margin:0">Опасная зона</h3><div><button class="btn danger" id="dWipe">Удалить все лиды</button></div></section>`;
    $('#dExp').onclick = () => download(`leadflow-backup-${today()}.json`, JSON.stringify({ app: 'leadflow', v: 2, leads: DB.all(), site, team }, null, 1), 'application/json');
    $('#dCsv').onclick = () => download(`leads-${today()}.csv`, leadsToCSV(DB.all()), 'text/csv;charset=utf-8');
    $('#dDemo').onclick = () => { toast(`Добавлено демо-лидов: ${loadDemo()}`); renderData(p); };
    $('#dImp').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try { const j = JSON.parse(await file.text()); if (!Array.isArray(j.leads)) throw new Error(); toast(`Восстановлено лидов: ${DB.add(j.leads)}`); renderData(p); }
      catch { toast('Этот файл не похож на резервную копию LeadFlow', 'error'); }
      e.target.value = '';
    };
    const owners = [...new Map(all.filter(l => l.owner).map(l => [l.owner, l.ownerName])).entries()];
    $('#dWho').innerHTML = owners.map(([id, n]) => `<option value="${id}">${esc(n || id)}</option>`).join('') || '<option value="">нет закреплённых лидов</option>';
    $('#dFree').onclick = () => {
      const id = $('#dWho').value; if (!id) return; const list = DB.all().filter(l => l.owner === id && !['won', 'lost'].includes(l.status));
      if (!list.length) return toast('Незакрытых лидов нет'); if (!confirm(`Освободить ${list.length} лидов?`)) return;
      list.forEach(l => DB.update(l.id, { owner: null, ownerName: '' })); toast(`Освобождено: ${list.length}`); renderData(p);
    };
    $('#dPurge') && ($('#dPurge').onclick = async e => { e.currentTarget.disabled = true; try { toast(`Удалено окончательно: ${await Cloud.purgeDeleted()}`); } catch (x) { toast(x.message, 'error'); } e.currentTarget && (e.currentTarget.disabled = false); });
    $('#dWipe').onclick = () => { const n = DB.all().length; if (!n) return toast('База уже пустая'); const v = prompt(`Будут удалены все ${n} лидов у всей команды. Сначала скачайте резервную копию. Чтобы подтвердить, введите слово УДАЛИТЬ`); if (v === 'УДАЛИТЬ') { DB.removeAll(); toast('Все лиды удалены'); renderData(p); } };
  }

  /* Облако */
  function renderCloud(p) {
    p.innerHTML = `<section class="card stack">
      <h3 style="margin:0">${Cloud.on ? '<span class="badge ok">Подключено</span> Облако Supabase' : '<span class="badge warn">Локальный режим</span> Подключите облако для команды'}</h3>
      ${Cloud.on ? `<p class="muted" style="margin:0">Все сотрудники работают с общей базой. Изменения видны коллегам сразу. Адрес проекта: ${esc(CFG.supabaseUrl)}</p>`
      : `<p class="muted" style="margin:0">Сейчас аккаунты и лиды хранятся только в этом браузере. Чтобы каждый сотрудник входил со своего телефона или компьютера и видел общую базу, нужна бесплатная база Supabase (до 500 МБ — это сотни тысяч лидов).</p>
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>Зарегистрируйтесь на <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> и создайте проект (тариф Free, регион — Frankfurt).</li>
        <li>Откройте <b>SQL Editor → New query</b>, вставьте содержимое файла <a href="supabase.sql" target="_blank">supabase.sql</a> и нажмите <b>Run</b>.</li>
        <li><b>Authentication → Sign In / Providers → Email</b>: выключите «Confirm email» и сохраните.</li>
        <li><b>Project Settings → API</b>: скопируйте <i>Project URL</i> и <i>anon public key</i> в файл <code>data/config.js</code>.</li>
        <li>Опубликуйте сайт заново и откройте его: первый вход создаст аккаунт администратора, дальше добавляйте сотрудников во вкладке «Команда».</li>
      </ol>
      <p class="small muted" style="margin:0">Контакты и цены, которые вы меняете здесь в локальном режиме, сохраняются в этом браузере. <button class="btn" id="dlSite" style="min-height:32px">Скачать site.js</button> — чтобы перенести их в файл сайта.</p>`}
    </section>`;
    $('#dlSite') && ($('#dlSite').onclick = () => download('site.js', `/* Данные сайта: контакты, цены, примеры. */\nwindow.SITE_DEFAULT = ${JSON.stringify(site, null, 2)};\n`, 'text/javascript'));
  }

  $('#save').onclick = async () => {
    const b = $('#save'); b.disabled = true;
    try { await Site.set(site); await Team.set(team); dirty = false; $('#state').textContent = Cloud.on ? 'Сохранено — коллеги увидят изменения после обновления страницы' : 'Сохранено в этом браузере'; toast('Сохранено'); }
    catch (e) { toast('Не удалось сохранить: ' + e.message, 'error'); }
    finally { b.disabled = false; }
  };
  $('#undo').onclick = () => { site = clone(Site.get()); team = clone(Team.get()); dirty = false; $('#state').textContent = ''; renderPanel(); };
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.some(x => x[0] === t) && t !== tab) { tab = t; renderTabs(); renderPanel(); } });
  if (!TABS.some(x => x[0] === tab)) tab = 'team';
  renderTabs(); renderPanel();
}
