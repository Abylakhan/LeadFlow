/* CRM: воронка, таблица, напоминания */
let view = LS.get('lf_crm_view', 'board');

function filtered() {
  const q = $('#q').value.trim().toLowerCase(); const who = $('#who').value;
  let list = DB.all();
  if (who === 'mine') list = list.filter(isMine); else if (who === 'free') list = list.filter(isFree);
  else if (who.startsWith('u:')) list = list.filter(l => l.owner === who.slice(2));
  return q ? list.filter(l => [l.name, l.phone, l.email, l.address, l.notes, l.city, l.ownerName].join(' ').toLowerCase().includes(q)) : list;
}

function render() {
  const all = DB.all(); const list = filtered();
  $('#stats').innerHTML = STATUSES.map(s => `<div class="stat"><b>${all.filter(l => l.status === s.id).length}</b><span>${s.label}</span></div>`).join('');
  countUp($('#stats'));
  const due = dueLeads(true);
  $('#due').innerHTML = due.length
    ? `<div class="notice"><span class="grow">Пора напомнить о себе: ${due.slice(0, 4).map(l => esc(l.name)).join(', ')}${due.length > 4 ? ` и ещё ${due.length - 4}` : ''}</span><a class="btn" href="outreach.html?filter=due">Написать повторно (${due.length})</a></div>` : '';

  if (!all.length) {
    $('#board').hidden = true; $('#table').hidden = false;
    $('#table').innerHTML = `<div class="card empty"><h3>В CRM пока нет лидов</h3><p>Найдите компании на карте или попросите ИИ-агента сделать это за вас.</p>
      <div class="row gap wrap-row" style="justify-content:center"><a class="btn primary" href="leads.html">Найти лидов</a><a class="btn" href="agent.html">Открыть ИИ-агента</a>${Auth.user.role === 'admin' ? '<button class="btn" id="demo">Загрузить демо-данные</button>' : ''}</div></div>`;
    if ($('#demo')) $('#demo').onclick = () => { loadDemo(); render(); toast('Демо-лиды добавлены'); };
    return;
  }
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#board').hidden = view !== 'board'; $('#table').hidden = view !== 'table';
  const box = view === 'board' ? $('#board') : $('#table');
  flip(box, view === 'board' ? '.lead-card' : 'tr[data-id]', () => view === 'board' ? renderBoard(list) : renderTable(list));
}

function card(l) {
  const overdue = l.nextFollowUp && l.nextFollowUp <= today() && ['contacted', 'replied', 'meeting'].includes(l.status);
  return `<div class="lead-card" draggable="true" data-id="${l.id}" tabindex="0" role="button" aria-label="Открыть ${esc(l.name)}">
    <div class="t">${esc(l.name)}</div>
    <div class="small muted">${esc(CATS[l.category]?.label || l.category || '')}</div>
    <div class="m"><span class="contacts">${l.phone ? '<span class="badge ok">тел</span>' : ''}${l.email ? '<span class="badge ok">@</span>' : ''}${!l.website ? '<span class="badge warn">без сайта</span>' : ''}${ownerBadge(l)}${l.draft ? '<span class="badge info">черновик</span>' : ''}</span>
    <span class="score ${scoreClass(l.score)}">${l.score}</span></div>
    ${l.nextFollowUp && l.status !== 'won' && l.status !== 'lost' ? `<div class="small" style="margin-top:6px;color:${overdue ? 'var(--warn)' : 'var(--muted)'}">Напомнить: ${fmtDate(l.nextFollowUp)}</div>` : ''}
  </div>`;
}

function renderBoard(list) {
  const b = $('#board');
  requestAnimationFrame(() => { if (window.__dropped) { const c = $(`.lead-card[data-id="${CSS.escape(window.__dropped)}"]`, b); c?.classList.add('dropped'); window.__dropped = null; } });
  b.innerHTML = STATUSES.map(s => { const items = list.filter(l => l.status === s.id).sort((a, z) => z.score - a.score);
    return `<div class="col" data-status="${s.id}"><div class="col-head"><span>${s.label}</span><span class="badge">${items.length}</span></div>${items.slice(0, 150).map(card).join('')}</div>`; }).join('');
  $$('.lead-card', b).forEach(c => {
    c.onclick = () => openLead(c.dataset.id, render);
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLead(c.dataset.id, render); } };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.col', b).forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = e => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain'); const st = col.dataset.status; const l = DB.get(id);
      if (!l || l.status === st) return;
      if (ownedByOther(l) && Auth.user.role !== 'admin' && !confirm(`Этого лида ведёт ${l.ownerName}. Всё равно перенести?`)) return;
      window.__dropped = id;
      DB.update(id, { status: st, ...(l.owner ? {} : { owner: Auth.user.id, ownerName: Auth.user.name }), ...(['won', 'lost'].includes(st) ? { nextFollowUp: null } : {}) }); DB.log(id, 'status', `Статус → ${statusLabel(st)}`);
      render();
    };
  });
}

const picked = new Set();
function renderTable(list) {
  const t = $('#table'); const admin = Auth.user.role === 'admin';
  const canEdit = l => admin || !ownedByOther(l);
  list.sort((a, z) => z.score - a.score);
  [...picked].forEach(id => { if (!list.some(l => l.id === id)) picked.delete(id); });
  t.innerHTML = `<div class="bulkbar" id="bulk" ${picked.size ? '' : 'hidden'}>
      <b id="bulkN"></b>
      <button class="btn" data-b="claim">Взять себе</button>
      <select id="bulkStatus" style="width:auto" aria-label="Сменить статус"><option value="">Сменить статус…</option>${STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
      ${admin ? '<button class="btn" data-b="free">Освободить</button><button class="btn danger" data-b="del">Удалить</button>' : ''}
      <button class="btn" data-b="clear">Снять выделение</button></div>
    <div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="pickAllRows" aria-label="Выбрать всех"></th><th>Компания</th><th>Статус</th><th>Контакты</th><th>Оценка</th><th>Ведёт</th><th>Касаний</th><th>Напомнить</th></tr></thead><tbody>
    ${list.map(l => `<tr class="click" data-id="${l.id}" tabindex="0">
      <td><input type="checkbox" class="rowpick" data-id="${l.id}" ${picked.has(l.id) ? 'checked' : ''} ${canEdit(l) ? '' : 'disabled title="Лида ведёт коллега"'} aria-label="Выбрать ${esc(l.name)}"></td>
      <td><div class="name">${esc(l.name)}</div><div class="small muted">${esc(CATS[l.category]?.label || '')} ${esc(l.city || '')}</div></td>
      <td><span class="badge ${l.status === 'won' ? 'ok' : l.status === 'lost' ? 'bad' : l.status === 'new' ? '' : 'info'}">${statusLabel(l.status)}</span>${l.lostReason ? `<div class="small muted">${esc(l.lostReason)}</div>` : ''}</td>
      <td><div class="contacts">${contactBadges(l)}</div></td>
      <td><span class="score ${scoreClass(l.score)}">${l.score}</span></td>
      <td>${l.owner ? esc(isMine(l) ? 'я' : l.ownerName) : '—'}</td><td>${l.touches || 0}</td><td>${fmtDate(l.nextFollowUp)}</td></tr>`).join('')}
  </tbody></table></div>`;
  const sync = () => { $('#bulk').hidden = !picked.size; $('#bulkN').textContent = `Выбрано: ${picked.size}`; };
  $$('.rowpick', t).forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { c.checked ? picked.add(c.dataset.id) : picked.delete(c.dataset.id); sync(); }; });
  $('#pickAllRows').onchange = e => { $$('.rowpick:not(:disabled)', t).forEach(c => { c.checked = e.target.checked; c.checked ? picked.add(c.dataset.id) : picked.delete(c.dataset.id); }); sync(); };
  $$('tr.click', t).forEach(r => { r.onclick = () => openLead(r.dataset.id, render); r.onkeydown = e => { if (e.key === 'Enter') openLead(r.dataset.id, render); }; });
  const ids = () => [...picked].filter(id => { const l = DB.get(id); return l && canEdit(l); });
  $$('[data-b]', t).forEach(b => b.onclick = () => {
    const a = b.dataset.b, list_ = ids();
    if (a === 'clear') { picked.clear(); render(); return; }
    if (a === 'claim') { list_.forEach(id => { if (!DB.get(id).owner) claim(id); }); toast(`Закреплено за вами: ${list_.length}`); }
    if (a === 'free') { list_.forEach(id => DB.update(id, { owner: null, ownerName: '' })); toast(`Освобождено: ${list_.length}`); }
    if (a === 'del') { if (!confirm(`Удалить ${list_.length} лидов? Отменить нельзя.`)) return; list_.forEach(id => DB.remove(id)); picked.clear(); toast('Удалено'); }
    render();
  });
  $('#bulkStatus').onchange = e => {
    const st = e.target.value; if (!st) return; const list_ = ids();
    list_.forEach(id => { const l = DB.get(id); DB.update(id, { status: st, ...(l.owner ? {} : { owner: Auth.user.id, ownerName: Auth.user.name }), ...(['won', 'lost'].includes(st) ? { nextFollowUp: null } : {}) }); DB.log(id, 'status', `Статус → ${statusLabel(st)}`); });
    toast(`Статус «${statusLabel(st)}» у ${list_.length} лидов`); render();
  };
  sync();
}

$$('.seg button').forEach(b => b.onclick = () => { if (view === b.dataset.view) return; view = b.dataset.view; LS.set('lf_crm_view', view); render(); replay(view === 'board' ? $('#board') : $('#table')); });
$('#q').oninput = render;
const savedWho = LS.get('lf_crm_who', 'all'); $('#who').value = savedWho;
$('#who').onchange = () => { LS.set('lf_crm_who', $('#who').value); render(); };
Auth.team().then(us => { $('#who').insertAdjacentHTML('beforeend', us.filter(u => u.id !== Auth.user.id).map(u => `<option value="u:${u.id}">Ведёт ${esc(u.name)}</option>`).join('')); $('#who').value = savedWho; if ($('#who').value !== savedWho) $('#who').value = 'all'; render(); }).catch(() => {});
$('#exportCsv').onclick = () => { const l = filtered(); if (!l.length) { toast('Нечего экспортировать', 'error'); return; } download(`leadflow-${today()}.csv`, leadsToCSV(l), 'text/csv;charset=utf-8'); };
window.addEventListener('lf-data', () => { if (!$('#drawer')) render(); });
render();
const openId = new URLSearchParams(location.search).get('lead'); if (openId) openLead(openId, render);
