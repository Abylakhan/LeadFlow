/* Страница поиска лидов */
let found = [];
let cities = [];
const MAX_CITIES = 5;
$('#cat').innerHTML = Object.entries(CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
$('#country').innerHTML = Object.keys(COUNTRIES).map(c => `<option>${c}</option>`).join('') + '<option value="">Другая страна</option>';
const last = LS.get('lf_last_search', null);
const defCity = Settings.get().city;
$('#country').value = last?.country ?? (cityCountry(defCity) || 'Казахстан');
cities = last?.cities?.length ? last.cities : [defCity];
if (last?.category) $('#cat').value = last.category;

/* Выбор городов: чипы добавляются и убираются по одному, с анимацией, без перерисовки остальных */
const chipsBox = $('#cityChips'), quickBox = $('#cityQuick');
let searching = false;
const sameCity = (a, b) => a.toLowerCase() === b.toLowerCase();
function chipEl(name) {
  const s = document.createElement('span'); s.className = 'city-chip'; s.dataset.city = name;
  s.innerHTML = `<span>${esc(name)}</span><button type="button" aria-label="Убрать ${esc(name)}">✕</button>`;
  $('button', s).onclick = () => removeCity(name);
  return s;
}
function syncChipsEmpty() {
  let hint = $('.chips-empty', chipsBox);
  if (!cities.length && !hint) chipsBox.insertAdjacentHTML('beforeend', '<span class="chips-empty small muted">Добавьте хотя бы один город</span>');
  if (cities.length && hint) hint.remove();
  $('#cityAddBtn').disabled = searching || cities.length >= MAX_CITIES;
  $('#cityAdd').disabled = searching;
  $('#cityAdd').placeholder = cities.length >= MAX_CITIES ? `Максимум ${MAX_CITIES} городов` : 'Начните вводить город';
}
function renderQuick() {
  const list = COUNTRIES[$('#country').value]?.cities || [];
  const want = cities.length >= MAX_CITIES ? [] : list.filter(c => !cities.some(x => sameCity(x, c))).slice(0, 8);
  const have = $$('.chip', quickBox).map(b => b.dataset.c);
  // убираем лишние с анимацией, добавляем недостающие
  $$('.chip', quickBox).forEach(b => { if (!want.includes(b.dataset.c)) animateOut(b); });
  want.forEach((c, i) => {
    if (have.includes(c)) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip chip-in'; b.dataset.c = c; b.textContent = '+ ' + c;
    b.style.animationDelay = `${i * 25}ms`; b.disabled = searching; b.onclick = () => addCity(c);
    const next = $$('.chip', quickBox).find(x => list.indexOf(x.dataset.c) > list.indexOf(c) && !x.classList.contains('leaving'));
    next ? quickBox.insertBefore(b, next) : quickBox.append(b);
  });
}
function animateOut(el) {
  if (el.classList.contains('leaving')) return;
  if (calm()) { el.remove(); return; }
  el.classList.add('leaving'); el.style.width = el.offsetWidth + 'px';
  requestAnimationFrame(() => el.classList.add('gone'));
  setTimeout(() => el.remove(), 260);
}
function renderCityUI(full = false) {
  $('#cityList').innerHTML = (COUNTRIES[$('#country').value]?.cities || []).map(c => `<option value="${esc(c)}">`).join('');
  if (full) { chipsBox.innerHTML = ''; quickBox.innerHTML = ''; cities.forEach(c => chipsBox.append(chipEl(c))); }
  syncChipsEmpty(); renderQuick();
}
function addCity(name) {
  if (searching) return;
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!name) return;
  if (!/[a-zа-яёәғқңөұүһіўҳ]/i.test(name)) { toast('Название города выглядит странно — проверьте', 'error'); return; }
  const norm = Object.values(COUNTRIES).flatMap(c => c.cities).find(c => sameCity(c, name)) || name[0].toUpperCase() + name.slice(1);
  const existing = cities.find(c => sameCity(c, norm));
  if (existing) { const el = $$('.city-chip', chipsBox).find(x => x.dataset.city === existing); el?.classList.remove('nudge'); void el?.offsetWidth; el?.classList.add('nudge'); $('#cityAdd').value = ''; return; }
  if (cities.length >= MAX_CITIES) { toast(`Не больше ${MAX_CITIES} городов за раз`, 'error'); return; }
  // город из другой страны — переключаем страну, чтобы подсказки совпадали
  const co = cityCountry(norm); if (co && co !== $('#country').value && !cities.length) { $('#country').value = co; renderCityUI(); }
  cities.push(norm); chipsBox.append(chipEl(norm)); $('#cityAdd').value = '';
  syncChipsEmpty(); renderQuick();
}
function removeCity(name) {
  if (searching) return;
  cities = cities.filter(c => c !== name);
  const el = $$('.city-chip', chipsBox).find(x => x.dataset.city === name); if (el) animateOut(el);
  setTimeout(syncChipsEmpty, calm() ? 0 : 260); renderQuick();
  $('#cityAddBtn').disabled = false;
}
$('#cityAddBtn').onclick = () => { addCity($('#cityAdd').value); $('#cityAdd').focus(); };
$('#cityAdd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCity($('#cityAdd').value); } });
// выбор из подсказки браузера добавляет город сразу
$('#cityAdd').addEventListener('input', e => { if (e.inputType === 'insertReplacementText' || (!e.inputType && (COUNTRIES[$('#country').value]?.cities || []).includes(e.target.value))) addCity(e.target.value); });
$('#country').onchange = () => {
  if (searching) return;
  const list = COUNTRIES[$('#country').value]?.cities;
  $$('.city-chip', chipsBox).forEach(animateOut);
  cities = list ? [list[0]] : [];
  setTimeout(() => { $$('.city-chip:not(.leaving)', chipsBox).forEach(x => x.remove()); cities.forEach(c => chipsBox.append(chipEl(c))); syncChipsEmpty(); }, calm() ? 0 : 200);
  quickBox.innerHTML = ''; renderCityUI();
  if (!list) setTimeout(() => $('#cityAdd').focus(), 50);
};
function lockCities(on) {
  searching = on;
  $('#country').disabled = on; $$('button', chipsBox).forEach(b => b.disabled = on); $$('.chip', quickBox).forEach(b => b.disabled = on);
  $('.city-picker').classList.toggle('locked', on); syncChipsEmpty();
}
renderCityUI(true);

const timeAgo = iso => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 60 ? `${Math.max(m, 1)} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
let history_ = [];
async function renderHistory() {
  try { history_ = await Searches.recent(); } catch { history_ = []; }
  const box = $('#history');
  if (!history_.length) { box.textContent = 'Пока никто не искал. Ваш поиск появится здесь, чтобы коллеги не повторяли его.'; return; }
  box.innerHTML = history_.slice(0, 8).map((h, i) => `<button type="button" class="hist" data-i="${i}"><b>${esc(CATS[h.category]?.label || h.category)}</b> · ${esc(h.city)}<span>${esc(h.user_name || '')} · ${timeAgo(h.created_at)} · найдено ${h.found}</span></button>`).join('');
  $$('.hist', box).forEach(b => b.onclick = () => { const h = history_[+b.dataset.i]; $('#cat').value = h.category; if (searching) return; const co = cityCountry(h.city); if (co) $('#country').value = co; cities = [h.city]; renderCityUI(true); toast('Параметры подставлены — нажмите «Найти компании»'); });
}
renderHistory();

function renderResults() {
  const box = $('#results');
  if (!found.length) { box.innerHTML = '<div class="empty"><h3>Ничего не найдено</h3><p>Попробуйте соседнюю нишу, другой город или снимите галочку «Только с контактами».</p></div>'; $('#addSel').disabled = true; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="all" checked aria-label="Выбрать все"></th><th>Компания</th><th>Контакты</th><th>Оценка</th></tr></thead><tbody>
  ${found.map((l, i) => { const inCrm = DB.has(l); return `<tr>
    <td><input type="checkbox" class="sel" data-i="${i}" ${inCrm ? 'disabled' : 'checked'} aria-label="Выбрать ${esc(l.name)}"></td>
    <td><div class="name">${esc(l.name)}</div><div class="small muted">${new Set(found.map(f => f.city)).size > 1 ? esc(l.city) + ' · ' : ''}${esc(l.address || 'адрес не указан')}${inCrm ? ' · <b>уже в CRM</b>' : ''}</div>
      ${l.phone ? `<div class="small">${esc(l.phone)}</div>` : ''}${l.website ? `<div class="small"><a href="${esc(extUrl(l.website))}" target="_blank" rel="noopener">${esc(l.website.replace(/^https?:\/\//, '').slice(0, 40))}</a></div>` : ''}</td>
    <td><div class="contacts">${contactBadges(l)}</div></td>
    <td><span class="score ${scoreClass(l.score)}">${l.score}</span></td></tr>`; }).join('')}
  </tbody></table></div>`;
  const sync = () => { const n = $$('.sel:checked').length; $('#addSel').disabled = !n; $('#addSel').textContent = n ? `Добавить в CRM (${n})` : 'Добавить в CRM'; };
  $('#all').onchange = e => { $$('.sel:not(:disabled)').forEach(c => c.checked = e.target.checked); sync(); };
  $$('.sel').forEach(c => c.onchange = sync); sync();
}

$('#searchForm').onsubmit = async e => {
  e.preventDefault();
  if ($('#cityAdd').value.trim()) addCity($('#cityAdd').value);
  if (!cities.length) { toast('Добавьте хотя бы один город', 'error'); $('#cityAdd').focus(); return; }
  const country = $('#country').value; const category = $('#cat').value;
  const base = { category, country, limit: +$('#limit').value, onlyContacts: $('#onlyContacts').checked, nameFilter: $('#nameFilter').value.trim() };
  LS.set('lf_last_search', { category, country, cities });
  // предупреждаем, если коллега недавно искал то же самое
  const dup = history_.find(h => h.category === category && cities.some(c => sameCity(c, h.city)) && Date.now() - new Date(h.created_at) < 3 * 864e5);
  if (dup && dup.user_name !== Auth.user.name && !confirm(`${dup.user_name} уже искал(а) «${CATS[category].label}» в ${dup.city} ${timeAgo(dup.created_at)}. Новых компаний будет мало. Всё равно искать?`)) return;
  const btn = $('#searchBtn'); btn.disabled = true;
  $('#resTitle').textContent = `${CATS[category].label}: ${cities.join(', ')}`;
  $('#resTitle').classList.remove('flash'); void $('#resTitle').offsetWidth; $('#resTitle').classList.add('flash');
  $('#results').innerHTML = '<div class="skeleton"></div>'.repeat(6);
  found = []; const failed = []; const list = [...cities];
  lockCities(true);
  for (let i = 0; i < list.length; i++) {
    const city = list[i];
    btn.innerHTML = `<span class="spin"></span> ${list.length > 1 ? `${i + 1}/${list.length}: ` : ''}${esc(city)}…`;
    $('#resSub').textContent = `Ищу в городе ${city} — обычно 10–40 секунд${found.length ? ` · уже найдено ${found.length}` : ''}`;
    $$('.city-chip', chipsBox).forEach(x => x.classList.toggle('active', x.dataset.city === city));
    try {
      const part = await searchLeads({ ...base, city, country: cityCountry(city) || country });
      found.push(...part);
      Searches.add({ category, city, found: part.length }).catch(() => {});
      if (found.length) renderResults();
    } catch (err) { failed.push(`${city}: ${err.message}`); }
  }
  found.sort((a, b) => b.score - a.score);
  lockCities(false); $$('.city-chip', chipsBox).forEach(x => x.classList.remove('active'));
  btn.disabled = false; btn.textContent = 'Найти компании';
  renderHistory();
  if (!found.length && failed.length) {
    $('#resSub').textContent = '';
    $('#results').innerHTML = `<div class="empty"><h3>Не получилось загрузить</h3><p>${esc(failed.join('; '))}</p><button class="btn" id="retry">Повторить поиск</button></div>`;
    $('#retry').onclick = () => $('#searchForm').requestSubmit(); return;
  }
  const noSite = found.filter(l => !l.website).length;
  $('#resSub').textContent = `Найдено ${found.length} · без сайта ${noSite} · с телефоном ${found.filter(l => l.phone).length}${failed.length ? ` · не загрузились: ${failed.map(f => f.split(':')[0]).join(', ')}` : ''}`;
  renderResults();
};

$('#addSel').onclick = () => {
  const picked = $$('.sel:checked').map(c => found[+c.dataset.i]);
  const n = DB.add(picked);
  toast(`Добавлено в CRM: ${n}`);
  renderResults();
  $('#resSub').insertAdjacentHTML('beforeend', ' · <a href="crm.html">Открыть CRM →</a>');
};

$('#manualForm').onsubmit = e => {
  e.preventDefault(); const f = new FormData(e.target); const w = String(f.get('website') || '').trim();
  const lead = { name: f.get('name').trim(), phone: f.get('phone').trim(), email: f.get('email').trim(), city: cities[0] || Settings.get().city, country: $('#country').value, source: 'вручную' };
  if (/instagram|^@/.test(w)) lead.instagram = w; else lead.website = w;
  if (DB.add([lead])) { toast(`«${lead.name}» добавлен в CRM`); e.target.reset(); } else toast('Такой лид уже есть в CRM', 'error');
};

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
const HEAD_MAP = { name: 'name', 'название': 'name', 'компания': 'name', phone: 'phone', 'телефон': 'phone', email: 'email', 'почта': 'email', website: 'website', 'сайт': 'website', city: 'city', 'город': 'city', address: 'address', 'адрес': 'address', instagram: 'instagram', category: 'category', 'категория': 'category', notes: 'notes', 'заметки': 'notes' };
$('#csv').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const rows = parseCSV((await file.text()).replace(/^﻿/, ''));
  if (rows.length < 2) { toast('В файле нет строк с данными', 'error'); return; }
  const heads = rows[0].map(h => HEAD_MAP[h.trim().toLowerCase()] || null);
  if (!heads.includes('name')) { toast('Не нашёл колонку name или «название»', 'error'); return; }
  const leads = rows.slice(1).map(r => { const o = { source: 'CSV', city: Settings.get().city }; heads.forEach((h, i) => { if (h && r[i]) o[h] = r[i].trim(); }); if (o.category && !CATS[o.category]) o.category = detectCategory(o.category) || o.category; return o; }).filter(o => o.name);
  toast(`Импортировано: ${DB.add(leads)} из ${leads.length}`); e.target.value = '';
};
