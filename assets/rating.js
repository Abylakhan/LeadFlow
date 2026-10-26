/* Рейтинг (соревнование за премию месяца) и еженедельные отчёты в Excel */
{
  const me = Auth.user; const isAdmin = me.role === 'admin';
  let month = monthStart(); let users = [];
  const fmtD = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  /* ---------- вкладки ---------- */
  const showTab = t => {
    $('#contest').hidden = t !== 'contest'; $('#reports').hidden = t !== 'reports';
    $$('#rtabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    replay($('#' + t)); history.replaceState(null, '', '#' + t);
    requestAnimationFrame(updateSegs);
  };
  $$('#rtabs button').forEach(b => b.onclick = () => showTab(b.dataset.t));

  /* ---------- соревнование ---------- */
  async function renderContest() {
    const cfg = contestCfg(); const from = month, to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const isCurrent = monthKey(month) === monthKey(new Date());
    $('#mTitle').textContent = monthName(month);
    $('#mNext').disabled = isCurrent;
    const daysLeft = Math.ceil((to - new Date()) / 864e5);
    $('#mLeft').textContent = isCurrent ? `до итогов ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}` : (cfg.paidMonths?.[monthKey(month)] ? 'премия выплачена' : 'итоги подведены');
    $('#mLeft').className = 'badge ' + (isCurrent ? 'info' : 'ok');
    $('#prizes').innerHTML = cfg.prizes.map((p, i) => `<div class="prize p${i + 1}" style="--i:${i}"><span>${['🥇', '🥈', '🥉'][i] || ''} ${i + 1} место</span><b>${money(p)}</b></div>`).join('');
    $('#board').innerHTML = '<tr><td colspan="8"><div class="skeleton"></div></td></tr>';
    let rows;
    try { rows = scoreEvents(await Activity.range(from.toISOString(), to.toISOString()), users); }
    catch (e) { $('#board').innerHTML = `<tr><td colspan="8">${esc(e.message)}</td></tr>`; return; }
    const max = Math.max(1, ...rows.map(r => r.points));
    const top = rows.slice(0, 3);
    const order = [1, 0, 2].filter(i => top[i]);
    $('#podium').innerHTML = rows.length ? order.map(i => { const r = top[i]; const ok = r.points >= cfg.minPoints;
      return `<div class="pod pod${i + 1}${r.user.id === me.id ? ' me' : ''}"><div class="pod-name">${esc(r.user.name)}</div><div class="pod-pts">${r.points} очк.</div>
        <div class="pod-bar" style="--h:${40 + Math.round(r.points / max * 100)}px"><span>${i + 1}</span></div>${ok && cfg.prizes[i] ? `<div class="small muted">${money(cfg.prizes[i])}</div>` : `<div class="small muted">нужно ${cfg.minPoints} очк.</div>`}</div>`; }).join('')
      : '<div class="empty" style="grid-column:1/-1">В соревновании пока никого: участвуют все подтверждённые сотрудники, кроме администратора.</div>';
    $('#board').innerHTML = rows.map((r, i) => `<tr class="${r.user.id === me.id ? 'me-row' : ''}"><td><b>${i + 1}</b></td>
      <td><b>${esc(r.user.name)}</b>${r.user.id === me.id ? ' <span class="badge ok">вы</span>' : ''}${r.points < cfg.minPoints ? `<div class="small muted">до премии: ${cfg.minPoints - r.points} очк.</div>` : ''}</td>
      <td><div class="pts"><b>${r.points}</b><span class="pts-bar"><i style="width:${Math.round(r.points / max * 100)}%"></i></span></div></td>
      <td>${r.touches}</td><td>${r.replied}</td><td>${r.meeting}</td><td>${r.won}</td><td>${r.paid ? money(r.paid) : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Нет участников</td></tr>';
    const P = cfg.pts;
    $('#rules').innerHTML = [`Сообщение или звонок — ${P.touch} очк. (не больше ${cfg.dailyTouchCap} в день)`, `Клиент ответил — ${P.replied} очк.`, `Назначена встреча — ${P.meeting} очк.`, `Клиент оплатил — ${P.won} очк.`, `Каждые 10 000 ₸ оплаты — ${P.per10k} очк.`, `Премия — от ${cfg.minPoints} очков`, cfg.rules].filter(Boolean).map((t, i) => `<li style="--i:${i}">${esc(t)}</li>`).join('');
    if (isAdmin) renderAdmin(cfg, rows, isCurrent);
  }
  function renderAdmin(cfg, rows, isCurrent) {
    const box = $('#adminBox'); box.hidden = false; const key = monthKey(month); const paid = cfg.paidMonths?.[key];
    box.innerHTML = `<h3 style="margin:0">Настройки премии <span class="badge">видно только вам</span></h3>
      <div class="row gap wrap-row">${cfg.prizes.map((p, i) => `<label>${i + 1} место, ₸<input type="number" min="0" step="5000" data-prize="${i}" value="${p}" style="width:130px"></label>`).join('')}</div>
      <div class="row gap wrap-row">
        <label>Касание<input type="number" min="0" data-pt="touch" value="${cfg.pts.touch}" style="width:80px"></label>
        <label>Ответ<input type="number" min="0" data-pt="replied" value="${cfg.pts.replied}" style="width:80px"></label>
        <label>Встреча<input type="number" min="0" data-pt="meeting" value="${cfg.pts.meeting}" style="width:80px"></label>
        <label>Оплата<input type="number" min="0" data-pt="won" value="${cfg.pts.won}" style="width:80px"></label>
        <label>За 10 000 ₸<input type="number" min="0" data-pt="per10k" value="${cfg.pts.per10k}" style="width:90px"></label>
        <label>Мин. очков<input type="number" min="0" id="cMin" value="${cfg.minPoints}" style="width:90px"></label>
      </div>
      <label>Правила для команды<textarea id="cRules" rows="2">${esc(cfg.rules)}</textarea></label>
      <div class="row gap wrap-row"><button class="btn primary" id="cSave">Сохранить</button>
      ${!isCurrent && rows.length ? `<button class="btn" id="cPaid">${paid ? 'Отменить отметку о выплате' : 'Отметить премию выплаченной'}</button>` : ''}</div>`;
    $('#cSave').onclick = async () => {
      const c = { ...(Team.get().contest || {}), prizes: $$('[data-prize]', box).map(i => Math.max(0, +i.value || 0)), minPoints: Math.max(0, +$('#cMin').value || 0), rules: $('#cRules').value.trim().slice(0, 500), pts: Object.fromEntries($$('[data-pt]', box).map(i => [i.dataset.pt, Math.max(0, +i.value || 0)])) };
      try { await Team.set({ ...Team.get(), contest: c }); toast('Настройки премии сохранены'); renderContest(); } catch (e) { toast(e.message, 'error'); }
    };
    $('#cPaid') && ($('#cPaid').onclick = async () => {
      const c = { ...(Team.get().contest || {}) }; c.paidMonths = { ...(c.paidMonths || {}), [key]: !paid };
      try { await Team.set({ ...Team.get(), contest: c }); toast(paid ? 'Отметка снята' : 'Отмечено: премия выплачена'); renderContest(); } catch (e) { toast(e.message, 'error'); }
    });
  }
  $('#mPrev').onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); replay($('#contest')); renderContest(); };
  $('#mNext').onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); replay($('#contest')); renderContest(); };

  /* ---------- отчёты ---------- */
  const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = weekStart(new Date()); s.setDate(s.getDate() - 7 * i); const e = new Date(s); e.setDate(e.getDate() + 7); return { s, e }; });
  $('#week').innerHTML = weeks.map((w, i) => { const last = new Date(w.e - 864e5); return `<option value="${i}">${fmtD(w.s)} – ${fmtD(last)}${i === 0 ? ' (текущая)' : i === 1 ? ' (прошлая)' : ''}</option>`; }).join('');
  $('#week').value = '1';
  $('#repHint').textContent = isAdmin ? 'Отчёт по всей команде и по каждому сотруднику. Готов каждый понедельник за прошлую неделю.' : 'Ваш отчёт за неделю: касания, ответы, встречи, клиенты и оплаты. Готов каждый понедельник.';
  const ACT = { touch: 'Сообщение / звонок', added: 'Добавлен лид', paid: 'Оплата получена' };
  const actLabel = t => ACT[t] || (t.startsWith('status:') ? 'Статус → ' + statusLabel(t.slice(7)) : t);
  const dt = iso => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function personSheets(u, row, events, place, total) {
    const leadsById = new Map(DB.all().map(l => [l.id, l]));
    const mine = DB.all().filter(l => l.owner === u.id);
    return [
      { name: 'Итоги', titleRow: 0, headerRow: 2, widths: [34, 18], rows: [
        [`Отчёт: ${u.name}`], [`Неделя ${$('#week').selectedOptions[0].textContent}`],
        ['Показатель', 'Значение'],
        ['Сообщений и звонков', row.touches], ['Добавлено лидов', row.added], ['Клиент ответил', row.replied], ['Назначено встреч', row.meeting],
        ['Клиентов с оплатой', row.won], ['Получено оплат, ₸', row.paid], ['Очки за неделю', row.points], ['Место в команде за неделю', place ? `${place} из ${total}` : '—'],
        ['Ведёт лидов сейчас', mine.filter(l => !['won', 'lost'].includes(l.status)).length], ['Пора напомнить (сейчас)', mine.filter(l => l.nextFollowUp && l.nextFollowUp <= today() && !['won', 'lost'].includes(l.status)).length]] },
      { name: 'Действия', headerRow: 0, widths: [18, 36, 26, 14], rows: [['Дата и время', 'Лид', 'Действие', 'Значение'],
        ...events.filter(e => e.user === u.id).map(e => [dt(e.at), leadsById.get(e.lead)?.name || '(удалён)', actLabel(e.type), e.type === 'paid' ? e.value : (e.value > 1 ? e.value : '')])] },
      { name: 'Мои лиды', headerRow: 0, widths: [34, 14, 12, 10, 12, 14, 14, 18], rows: [['Компания', 'Город', 'Статус', 'Касаний', 'Напомнить', 'Сумма, ₸', 'Оплачено, ₸', 'Телефон'],
        ...mine.map(l => [l.name, l.city || '', statusLabel(l.status), +l.touches || 0, l.nextFollowUp || '', +l.amount || 0, +l.paid || 0, l.phone || ''])] },
    ];
  }
  async function renderReports() {
    const w = weeks[+$('#week').value];
    $('#repPreview').innerHTML = '<div class="skeleton"></div>'; $('#repBtns').innerHTML = '';
    let events, all;
    try { events = await Activity.range(w.s.toISOString(), w.e.toISOString()); all = isAdmin ? await Auth.team() : [me]; }
    catch (e) { $('#repPreview').innerHTML = `<p class="form-err">${esc(e.message)}</p>`; return; }
    const ranked = scoreEvents(events, users); // место считается среди участников соревнования
    const rows = scoreEvents(events, all);
    const show = isAdmin ? rows : rows.filter(r => r.user.id === me.id);
    $('#repPreview').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Касаний</th><th>Добавлено</th><th>Ответили</th><th>Встреч</th><th>Клиентов</th><th>Оплачено</th><th>Очки</th></tr></thead><tbody>
      ${show.map(r => `<tr><td><b>${esc(r.user.name)}</b></td><td>${r.touches}</td><td>${r.added}</td><td>${r.replied}</td><td>${r.meeting}</td><td>${r.won}</td><td>${r.paid ? money(r.paid) : '—'}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table></div>`;
    const stamp = `${w.s.getFullYear()}-${String(w.s.getMonth() + 1).padStart(2, '0')}-${String(w.s.getDate()).padStart(2, '0')}`;
    $('#repBtns').innerHTML = isAdmin
      ? `<button class="btn primary" id="repTeam">Скачать отчёт команды (Excel)</button>${rows.map((r, i) => `<button class="btn" data-u="${i}">${esc(r.user.name)}</button>`).join('')}`
      : `<button class="btn primary" id="repMe">Скачать мой отчёт (Excel)</button>`;
    const one = r => { const place = ranked.findIndex(x => x.user.id === r.user.id) + 1; downloadBlob(`otchet-${stamp}-${r.user.name}.xlsx`, XLSX.build(personSheets(r.user, r, events, place, ranked.length))); toast('Отчёт скачан'); };
    $('#repMe') && ($('#repMe').onclick = () => one(rows[0]));
    $$('[data-u]', $('#repBtns')).forEach(b => b.onclick = () => one(rows[+b.dataset.u]));
    $('#repTeam') && ($('#repTeam').onclick = () => {
      const leadsById = new Map(DB.all().map(l => [l.id, l])); const names = new Map(rows.map(r => [r.user.id, r.user.name]));
      const sheets = [
        { name: 'Команда', titleRow: 0, headerRow: 2, widths: [26, 12, 12, 12, 10, 12, 16, 10, 10], rows: [[`Отчёт команды — ${$('#week').selectedOptions[0].textContent}`], [],
          ['Сотрудник', 'Касаний', 'Добавлено', 'Ответили', 'Встреч', 'Клиентов', 'Оплачено, ₸', 'Очки', 'Место'],
          ...rows.map(r => { const place = ranked.findIndex(x => x.user.id === r.user.id) + 1; return [r.user.name, r.touches, r.added, r.replied, r.meeting, r.won, r.paid, r.points, place || '—']; }),
          ['Итого', ...['touches', 'added', 'replied', 'meeting', 'won', 'paid', 'points'].map(k => rows.reduce((t, r) => t + r[k], 0))]] },
        { name: 'Все действия', headerRow: 0, widths: [18, 22, 36, 26, 14], rows: [['Дата и время', 'Сотрудник', 'Лид', 'Действие', 'Значение'],
          ...events.map(e => [dt(e.at), names.get(e.user) || '—', leadsById.get(e.lead)?.name || '(удалён)', actLabel(e.type), e.type === 'paid' ? e.value : ''])] },
        ...rows.map(r => ({ name: r.user.name, headerRow: 0, widths: [18, 36, 26, 14], rows: [['Дата и время', 'Лид', 'Действие', 'Значение'], ...events.filter(e => e.user === r.user.id).map(e => [dt(e.at), leadsById.get(e.lead)?.name || '(удалён)', actLabel(e.type), e.type === 'paid' ? e.value : ''])] })),
      ];
      downloadBlob(`otchet-komandy-${stamp}.xlsx`, XLSX.build(sheets)); toast('Отчёт команды скачан');
    });
  }
  $('#week').onchange = renderReports;

  /* ---------- запуск ---------- */
  Auth.team().then(list => { users = list.filter(u => u.role !== 'admin'); renderContest(); renderReports(); })
    .catch(e => toast(e.message, 'error'));
  window.addEventListener('lf-data', () => { clearTimeout(window.__rt); window.__rt = setTimeout(() => { renderContest(); }, 800); });
  showTab(location.hash === '#reports' ? 'reports' : 'contest');
}
