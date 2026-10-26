/* «Сегодня»: личный план и статистика команды */
{
  let days = 1; let aiReady = true;
  // есть ли рабочий ИИ (у админа проверяем список ключей, остальным покажем, если генерация не удаётся)
  if (Auth.user.role === 'admin') AIKeys.list().then(k => { aiReady = k.some(x => !x.disabled); if (!aiReady) render(); }).catch(() => {});
  const since = d => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - (d - 1)); return t.toISOString(); };

  function render() {
    const all = DB.all(); const me = Auth.user;
    const h = new Date().getHours();
    $('#hello').textContent = `${h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'}, ${me.name}`;
    const from = since(1);
    const myEvents = all.flatMap(l => (l.history || []).filter(e => e.byId === me.id && e.at >= from));
    const sentToday = myEvents.filter(e => e.type === 'sent').length;
    const mine = all.filter(isMine);
    const replied = mine.filter(l => l.status === 'replied');
    const meetings = mine.filter(l => l.status === 'meeting');
    const due = dueLeads(true).filter(l => isMine(l) || isFree(l));
    const freeNew = all.filter(l => l.status === 'new' && isFree(l));
    const goal = +Team.get().dailyGoal || 20;
    $('#sub').textContent = `Цель на день — ${goal} новых сообщений. Отправлено: ${sentToday}.`;
    $('#kpis').innerHTML = [
      [sentToday + ' / ' + goal, 'Моих сообщений сегодня'], [replied.length, 'Ждут моего ответа'],
      [due.length, 'Пора напомнить'], [freeNew.length, 'Свободных новых лидов'],
    ].map(([v, t]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join('');
    countUp($('#kpis'));

    const todo = [];
    if (!aiReady) todo.push(me.role === 'admin'
      ? '<li><span><b>Подключите ИИ</b>: получите бесплатный ключ Gemini за минуту, и ИИ будет писать персональные сообщения всей команде</span><a class="btn primary" href="admin.html#ai">Добавить ключ</a></li>'
      : '<li><span>ИИ пока не подключён — сообщения пишутся по шаблону. Попросите администратора добавить ключ.</span></li>');
    replied.slice(0, 5).forEach(l => todo.push(`<li><span><b>${esc(l.name)}</b> ответил(а) — договоритесь о созвоне</span><button class="btn" data-open="${l.id}">Открыть</button></li>`));
    meetings.filter(l => !l.nextFollowUp || l.nextFollowUp <= today()).slice(0, 3).forEach(l => todo.push(`<li><span>Встреча с <b>${esc(l.name)}</b> — подготовьте расчёт по ценам</span><button class="btn" data-open="${l.id}">Открыть</button></li>`));
    if (due.length) todo.push(`<li><span>Напомнить о себе: <b>${due.length}</b> ${due.length === 1 ? 'лид' : 'лидов'}</span><a class="btn" href="outreach.html?filter=due">Написать</a></li>`);
    if (sentToday < goal && freeNew.length) todo.push(`<li><span>Написать новым лидам: ещё <b>${Math.min(goal - sentToday, freeNew.length)}</b> до цели</span><a class="btn primary" href="outreach.html">Начать рассылку</a></li>`);
    if (freeNew.length < 20) todo.push(`<li><span>Свободных лидов мало — найдите новую нишу или город</span><a class="btn" href="leads.html">Найти лидов</a></li>`);
    if (new Date().getDay() === 1) todo.unshift(`<li><span><b>Понедельник:</b> готов отчёт за прошлую неделю в Excel</span><a class="btn" href="rating.html#reports">Скачать отчёт</a></li>`);
    $('#todo').innerHTML = todo.join('') || '<li><span>Всё сделано. Отличная работа!</span></li>';
    $$('[data-open]').forEach(b => b.onclick = () => openLead(b.dataset.open, render));

    const counts = STATUSES.map(s => [s, all.filter(l => l.status === s.id).length]);
    const max = Math.max(1, ...counts.map(c => c[1]));
    $('#funnel').innerHTML = counts.map(([s, n]) => `<div><span>${s.label}</span><i style="width:${(n / max) * 100}%;${s.id === 'lost' ? 'background:var(--danger)' : ''}"></i><b>${n}</b></div>`).join('');
    const touched = all.filter(l => l.status !== 'new').length, ans = all.filter(l => ['replied', 'meeting', 'won'].includes(l.status)).length, won = all.filter(l => l.status === 'won');
    const sum = won.reduce((a, l) => a + (+l.amount || 0), 0);
    $('#conv').textContent = touched ? `Отвечают ${Math.round(ans / touched * 100)}% из тех, кому написали. Клиентов: ${won.length} на ${money(sum)}, получено оплат: ${money(all.reduce((t, l) => t + (+l.paid || 0), 0))}.` : 'Статистика появится после первых сообщений.';
    const reasons = {}; all.filter(l => l.status === 'lost' && l.lostReason).forEach(l => { reasons[l.lostReason] = (reasons[l.lostReason] || 0) + 1; });
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) $('#conv').textContent += ` Чаще всего отказывают: ${top.map(([r, n]) => `${r.toLowerCase()} (${n})`).join(', ')}.`;

    renderTeam(); renderRank();
  }

  // место в соревновании за месяц
  async function renderRank() {
    const me = Auth.user; if (me.role === 'admin') return;
    try {
      const team = (await Auth.team()).filter(u => u.role !== 'admin');
      const rows = scoreEvents(await Activity.range(monthStart().toISOString(), new Date(Date.now() + 864e5).toISOString()), team);
      const i = rows.findIndex(r => r.user.id === me.id); if (i < 0) return;
      const cfg = contestCfg(); const gap = i > 0 ? rows[i - 1].points - rows[i].points : 0;
      const el = $('#rank') || $('.page-head > div').appendChild(Object.assign(document.createElement('a'), { id: 'rank', href: 'rating.html', className: 'rank-chip' }));
      el.innerHTML = `${['🥇', '🥈', '🥉'][i] || '🏁'} <b>${i + 1} место</b> в рейтинге месяца · ${rows[i].points} очк.${i > 0 ? ` · до ${i} места ${gap + 1} очк.` : cfg.prizes[0] ? ` · премия ${money(cfg.prizes[0])}` : ''}`;
    } catch { /* рейтинг не критичен для главной */ }
  }
  async function renderTeam() {
    let users; try { users = await Auth.team(); } catch { users = [Auth.user]; }
    const all = DB.all(); const from = since(days);
    const rows = users.map(u => {
      const ev = all.flatMap(l => (l.history || []).filter(e => e.byId === u.id && e.at >= from).map(e => ({ ...e, lead: l })));
      const st = s => ev.filter(e => e.type === 'status' && e.text.endsWith(statusLabel(s))).length;
      const wonLeads = [...new Set(ev.filter(e => e.type === 'status' && e.text.endsWith(statusLabel('won'))).map(e => e.lead))];
      return { u, sent: ev.filter(e => e.type === 'sent').length, calls: ev.filter(e => e.type === 'call').length, replied: st('replied'), meet: st('meeting'), won: wonLeads.length, sum: wonLeads.reduce((a, l) => a + (+l.amount || 0), 0), owns: all.filter(l => l.owner === u.id && !['won', 'lost'].includes(l.status)).length };
    }).sort((a, b) => b.won - a.won || b.sent - a.sent);
    $('#team').innerHTML = rows.map(r => `<tr><td><b>${esc(r.u.name)}</b>${r.u.id === Auth.user.id ? ' <span class="badge ok">вы</span>' : ''}</td><td>${r.sent}</td><td>${r.calls}</td><td>${r.replied}</td><td>${r.meet}</td><td>${r.won}</td><td>${r.sum ? money(r.sum) : '—'}</td><td>${r.owns}</td></tr>`).join('');
  }

  $$('#period button').forEach(b => b.onclick = () => { days = +b.dataset.d; $$('#period button').forEach(x => x.classList.toggle('on', x === b)); renderTeam(); });
  window.addEventListener('lf-data', render);
  render();
  reveal($$('main > section, .home-grid > section'));
}
