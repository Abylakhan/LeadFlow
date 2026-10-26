/* LeadFlow core: хранилище, настройки, ИИ, поиск лидов, отправка сообщений, общие UI-компоненты */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Браузер не даёт сохранить данные (приватный режим?)', 'error'); } },
};

const STATUSES = [
  { id: 'new', label: 'Новый' },
  { id: 'contacted', label: 'Написали' },
  { id: 'replied', label: 'Ответил' },
  { id: 'meeting', label: 'Встреча' },
  { id: 'won', label: 'Клиент' },
  { id: 'lost', label: 'Отказ' },
];
const statusLabel = id => (STATUSES.find(s => s.id === id) || {}).label || id;
const CH_LABEL = { whatsapp: 'WhatsApp', email: 'Email', telegram: 'Telegram', call: 'Звонок' };

if (window.top !== window.self) { try { window.top.location = window.self.location; } catch { document.documentElement.style.display = 'none'; } }
const CFG = window.LF_CONFIG || {};
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');

/* Настройки = общие настройки команды (задаёт админ: ИИ-ключ, предложение) + личные настройки сотрудника */
const TEAM_DEFAULTS = {
  company: '', offer: 'делаю сайты, CRM, Telegram-ботов и продвижение в Instagram и TikTok для бизнеса',
  city: 'Алматы', followupDays: 3, dailyGoal: 20, preferNoWebsite: true, 
};
const PERSONAL_DEFAULTS = { tone: 'дружелюбный и деловой', city: '', lang: 'ru' };
const Team = {
  data: null,
  get() { return { ...TEAM_DEFAULTS, ...(Team.data || LS.get('lf_team', {})) }; },
  async set(v) { Team.data = v; if (Cloud.on) await Cloud.saveConfig('team', v); else LS.set('lf_team', v); },
};
const personalKey = () => 'lf_me_' + (Auth.user?.id || 'anon');
const Settings = {
  get() {
    const p = { ...PERSONAL_DEFAULTS, ...LS.get(personalKey(), {}) };
    return { ...Team.get(), tone: p.tone, lang: p.lang, city: p.city || Team.get().city, myName: Auth.user?.name || '' };
  },
  personal() { return { ...PERSONAL_DEFAULTS, ...LS.get(personalKey(), {}) }; },
  setPersonal(p) { LS.set(personalKey(), { ...Settings.personal(), ...p }); },
};

/* Данные публичного сайта (контакты, цены, примеры): из облака, иначе из data/site.js и правок админа в этом браузере */
const Site = {
  data: null,
  get() { if (Site.data) return Site.data; const def = window.SITE_DEFAULT || {}; const draft = LS.get('lf_site', null); return draft ? { ...def, ...draft } : def; },
  async set(v) { Site.data = v; if (Cloud.on) await Cloud.saveConfig('site', v); else LS.set('lf_site', v); },
};
const money = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
const handle = v => String(v || '').trim().replace(/^https?:\/\/(www\.)?(t\.me|instagram\.com|tiktok\.com)\/@?/, '').replace(/^@/, '').replace(/\/$/, '');
const digits = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1); return d; };
function contactLinks(c = Site.get().contacts || {}) {
  const wa = digits(c.whatsapp), p2 = digits(c.phone2);
  const email = validEmail(c.email || '') ? normEmail(c.email) : '';
  return [
    wa && { k: 'whatsapp', label: 'WhatsApp', value: c.whatsapp, href: `https://wa.me/${wa}?text=${encodeURIComponent(c.waText || '')}` },
    p2 && { k: 'phone2', label: 'Телефон / WhatsApp', value: c.phone2, href: `tel:+${p2}` },
    c.telegram && { k: 'telegram', label: 'Telegram', value: '@' + handle(c.telegram), href: `https://t.me/${handle(c.telegram)}` },
    c.tgChannel && { k: 'tgChannel', label: 'Telegram-канал', value: '@' + handle(c.tgChannel), href: `https://t.me/${handle(c.tgChannel)}` },
    c.tgBot && { k: 'tgBot', label: 'Telegram-бот', value: '@' + handle(c.tgBot), href: `https://t.me/${handle(c.tgBot)}` },
    c.instagram && { k: 'instagram', label: 'Instagram', value: '@' + handle(c.instagram), href: `https://instagram.com/${handle(c.instagram)}` },
    c.tiktok && { k: 'tiktok', label: 'TikTok', value: '@' + handle(c.tiktok), href: `https://www.tiktok.com/@${handle(c.tiktok)}` },
    email && { k: 'email', label: 'Email', value: email, href: `mailto:${email}` },
  ].filter(Boolean);
}
function priceSummary() {
  const s = Site.get();
  return [...(s.packs || []).map(p => `${p.name} — от ${money(p.price)}${p.days ? ', ' + p.days : ''}`),
    ...(s.promo || []).slice(0, 4).map(p => `${p.name} — ${money(p.price)}${p.unit ? '/' + p.unit : ''}`)].join('; ');
}
const minPrice = () => Math.min(...(Site.get().packs || [{ price: 0 }]).map(p => +p.price || Infinity));

const today = () => new Date().toISOString().slice(0, 10);
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';

/* ---------- Лиды ---------- */
/* Лиды держим в памяти; изменения сохраняются в облако (общая база команды) или в браузер (локальный режим) */
let CACHE = null;
const DB = {
  all() { if (!CACHE) CACHE = Cloud.on ? [] : LS.get('lf_leads', []); return CACHE.slice(); },
  get(id) { DB.all(); return CACHE.find(l => l.id === id); },
  has(item) { const k = dedupeKey(item); return DB.all().some(l => dedupeKey(l) === k); },
  commit(changed = [], deleted = []) {
    if (Cloud.on) { Cloud.queue(changed, deleted); Cloud.saveCache(); } else LS.set('lf_leads', CACHE);
    window.dispatchEvent(new Event('lf-data'));
  },
  add(items) {
    DB.all(); const keys = new Set(CACHE.map(dedupeKey)); const fresh = [];
    for (const it of items) {
      const k = dedupeKey(it); if (keys.has(k)) continue;
      keys.add(k); const n = normalizeLead({ ...it, addedBy: Auth.user?.name || '', addedById: Auth.user?.id || '' }); CACHE.unshift(n); fresh.push(n);
    }
    if (fresh.length) DB.commit(fresh); return fresh.length;
  },
  update(id, patch) {
    DB.all(); const i = CACHE.findIndex(l => l.id === id); if (i < 0) return null;
    CACHE[i] = { ...CACHE[i], ...patch, updatedAt: new Date().toISOString() }; DB.commit([CACHE[i]]); return CACHE[i];
  },
  remove(id) { DB.removeMany([id]); },
  removeAll() { DB.removeMany(DB.all().map(l => l.id)); },
  removeMany(ids) {
    DB.all(); const set = new Set(ids); const gone = CACHE.filter(l => set.has(l.id)); CACHE = CACHE.filter(l => !set.has(l.id));
    if (Cloud.on) DB.commit(gone.map(l => ({ id: l.id, name: l.name, owner: l.owner || null, deleted: true, deletedAt: new Date().toISOString() })));
    else DB.commit([], ids);
  },
  log(id, type, text, extra = {}) {
    const l = DB.get(id); if (!l) return;
    DB.update(id, { history: [{ at: new Date().toISOString(), type, text, by: Auth.user?.name || '', byId: Auth.user?.id || '', ...extra }, ...(l.history || [])].slice(0, 80) });
  },
  // применить изменения, пришедшие от коллег (без повторной отправки в облако)
  applyRemote(lead, deletedId) {
    DB.all();
    if (deletedId) CACHE = CACHE.filter(l => l.id !== deletedId);
    else { const i = CACHE.findIndex(l => l.id === lead.id); if (i < 0) CACHE.unshift(lead); else CACHE[i] = lead; }
    if (Cloud.on) Cloud.saveCache();
    clearTimeout(DB._t); DB._t = setTimeout(() => window.dispatchEvent(new Event('lf-data')), 150);
  },
};
/* Закрепление лида за сотрудником, чтобы двое не писали одной компании */
const isMine = l => !!Auth.user && l.owner === Auth.user.id;
const isFree = l => !l.owner;
const ownedByOther = l => !!l.owner && !isMine(l);
function claim(id) { DB.update(id, { owner: Auth.user.id, ownerName: Auth.user.name }); DB.log(id, 'owner', `${Auth.user.name} взял(а) лида`); }
function release(id) { DB.update(id, { owner: null, ownerName: '' }); DB.log(id, 'owner', 'Лид освобождён'); }
function dedupeKey(l) { return l.osmId || ((l.name || '').toLowerCase().trim() + '|' + (l.phone || '').replace(/\D/g, '').slice(-9)); }
function normalizeLead(l) {
  const n = {
    name: '', category: '', city: '', address: '', phone: '', email: '', website: '', instagram: '', whatsapp: '', telegram: '',
    hours: '', source: 'manual', status: 'new', notes: '', draft: '', history: [], touches: 0, lastContact: null, nextFollowUp: null,
    createdAt: new Date().toISOString(), ...l,
  };
  n.id = n.id || 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (n.score == null) n.score = scoreLead(n);
  return n;
}
const dueLeads = (onlyMine = false) => DB.all().filter(l => ['contacted', 'replied', 'meeting'].includes(l.status) && l.nextFollowUp && l.nextFollowUp <= today() && (!onlyMine || isMine(l) || isFree(l)));

/* Оценка лида 0–100: чем больше способов связаться и чем выше шанс, что ему нужно ваше предложение — тем выше */
function scoreLead(l) {
  let s = 0;
  if (l.phone) s += 25;
  if (l.email) s += 20;
  if (l.whatsapp || l.telegram || l.instagram) s += 15;
  if (l.website) s += 10;
  if (l.hours) s += 5;
  if (l.address) s += 5;
  if (Settings.get().preferNoWebsite && !l.website) s += 20;
  return Math.min(100, s);
}
const scoreClass = s => s >= 60 ? 'hi' : s >= 35 ? 'mid' : '';

/* ---------- Ниши (теги OpenStreetMap) ---------- */
const CATS = {
  cafe: { label: 'Кафе и кофейни', q: [['amenity', 'cafe']], kw: ['кофе', 'кафе', 'cafe', 'coffee'] },
  restaurant: { label: 'Рестораны и фастфуд', q: [['amenity', 'restaurant'], ['amenity', 'fast_food']], kw: ['ресторан', 'фастфуд', 'столов', 'бургер', 'пицц', 'суши'] },
  beauty: { label: 'Салоны красоты и барбершопы', q: [['shop', 'beauty'], ['shop', 'hairdresser']], kw: ['салон', 'красот', 'парикмах', 'барбер', 'маникюр', 'ногт', 'бьюти'] },
  dentist: { label: 'Стоматологии', q: [['amenity', 'dentist'], ['healthcare', 'dentist']], kw: ['стомат', 'зуб', 'дантист'] },
  clinic: { label: 'Клиники и медцентры', q: [['amenity', 'clinic'], ['amenity', 'doctors']], kw: ['клиник', 'медцентр', 'медицин', 'врач'] },
  fitness: { label: 'Фитнес и спорт', q: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']], kw: ['фитнес', 'спортзал', 'тренаж', 'йог', 'спорт'] },
  hotel: { label: 'Отели и хостелы', q: [['tourism', 'hotel'], ['tourism', 'hostel'], ['tourism', 'guest_house']], kw: ['отел', 'гостиниц', 'хостел'] },
  auto: { label: 'Автосервисы и автомойки', q: [['shop', 'car_repair'], ['amenity', 'car_wash'], ['shop', 'tyres']], kw: ['авто', 'сто ', 'шиномонтаж', 'автомойк', 'мойк'] },
  clothes: { label: 'Магазины одежды и обуви', q: [['shop', 'clothes'], ['shop', 'shoes']], kw: ['одежд', 'обув', 'бутик', 'магазин'] },
  flowers: { label: 'Цветы и подарки', q: [['shop', 'florist'], ['shop', 'gift']], kw: ['цвет', 'флорист', 'подар'] },
  bakery: { label: 'Пекарни и кондитерские', q: [['shop', 'bakery'], ['shop', 'confectionery'], ['shop', 'pastry']], kw: ['пекар', 'кондитер', 'торт', 'выпеч'] },
  education: { label: 'Курсы, школы, детсады', q: [['amenity', 'language_school'], ['amenity', 'driving_school'], ['amenity', 'training'], ['amenity', 'kindergarten']], kw: ['курс', 'школ', 'обучен', 'детсад', 'детский сад', 'автошкол'] },
  realty: { label: 'Агентства недвижимости', q: [['office', 'estate_agent']], kw: ['недвиж', 'риелт', 'риэлт'] },
  legal: { label: 'Юристы и нотариусы', q: [['office', 'lawyer'], ['office', 'notary']], kw: ['юрист', 'адвокат', 'нотари'] },
  pharmacy: { label: 'Аптеки', q: [['amenity', 'pharmacy']], kw: ['аптек'] },
  furniture: { label: 'Мебель и стройматериалы', q: [['shop', 'furniture'], ['shop', 'hardware'], ['shop', 'doityourself']], kw: ['мебел', 'стройм', 'ремонт'] },
  vet: { label: 'Ветклиники и зоомагазины', q: [['amenity', 'veterinary'], ['shop', 'pet']], kw: ['вет', 'зоо', 'животн'] },
};
function detectCategory(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  if (CATS[t.trim()]) return t.trim();
  for (const [k, c] of Object.entries(CATS)) if (c.kw.some(w => t.includes(w))) return k;
  return null;
}

/* ---------- Страны и города ---------- */
const COUNTRIES = {
  'Казахстан': { code: '7', gis: '2gis.kz', langs: ['ru', 'kk'], cities: ['Алматы', 'Астана', 'Шымкент', 'Караганда', 'Актобе', 'Тараз', 'Павлодар', 'Усть-Каменогорск', 'Семей', 'Атырау', 'Костанай', 'Кызылорда', 'Уральск', 'Петропавловск', 'Актау', 'Туркестан', 'Кокшетау', 'Талдыкорган', 'Темиртау', 'Экибастуз', 'Жезказган', 'Конаев', 'Рудный', 'Жанаозен', 'Балхаш'] },
  'Узбекистан': { code: '998', gis: '2gis.uz', langs: ['ru', 'uz'], cities: ['Ташкент', 'Самарканд', 'Бухара', 'Наманган', 'Андижан', 'Фергана', 'Нукус', 'Карши', 'Коканд', 'Маргилан', 'Джизак', 'Ургенч', 'Навои', 'Термез', 'Хива', 'Гулистан', 'Чирчик', 'Ангрен'] },
  'Кыргызстан': { code: '996', gis: '2gis.kg', langs: ['ru', 'ky'], cities: ['Бишкек', 'Ош', 'Джалал-Абад', 'Каракол', 'Токмок', 'Кара-Балта', 'Нарын', 'Талас', 'Баткен', 'Узген', 'Балыкчы', 'Кант', 'Чолпон-Ата'] },
};
const LANGS = { ru: 'Русский', kk: 'Қазақша', uz: 'Oʻzbekcha', ky: 'Кыргызча' };
const LANG_PROMPT = { ru: 'на русском языке', kk: 'на казахском языке (қазақ тілінде, кириллицей)', uz: 'на узбекском языке (латиницей, oʻzbek tilida)', ky: 'на кыргызском языке (кыргыз тилинде, кириллицей)' };
const cityCountry = city => Object.keys(COUNTRIES).find(c => COUNTRIES[c].cities.includes(String(city || '').trim())) || '';

/* ---------- Поиск на OpenStreetMap ---------- */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function fetchT(url, opts = {}, ms = 45000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'превышено время ожидания' : 'нет соединения'); }
  finally { clearTimeout(t); }
}
async function geocode(city, country = cityCountry(city)) {
  const q = country ? `${city}, ${country}` : city;
  const cache = LS.get('lf_geo2', {}); const key = q.toLowerCase().trim();
  if (cache[key]) return cache[key];
  const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru';
  // сначала ищем именно город в стране (иначе «Балхаш» находится как озеро), затем — свободный поиск (район, посёлок)
  const tries = [country && `&city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`, `&q=${encodeURIComponent(q)}`].filter(Boolean);
  let j = [];
  for (const t of tries) {
    const r = await fetchT(base + t, {}, 20000);
    if (!r.ok) throw new Error('Сервис карт недоступен, попробуйте через минуту');
    j = await r.json(); if (j.length) break;
  }
  if (!j.length) throw new Error(`Город «${city}» не найден на карте — проверьте написание`);
  let [s_, n, w, e] = j[0].boundingbox.map(Number);
  // слишком большая область (область/район вместо города) — сужаем до ~25 км вокруг центра
  if ((n - s_) * (e - w) > 0.5) { const lat = +j[0].lat, lon = +j[0].lon; s_ = lat - 0.22; n = lat + 0.22; w = lon - 0.3; e = lon + 0.3; }
  const res = { s: s_, n, w, e, name: j[0].display_name };
  cache[key] = res; LS.set('lf_geo2', cache); return res;
}
function firstVal(v) { return String(v || '').split(';')[0].trim(); }
function osmToLead(el, category, city, country = '') {
  const t = el.tags || {};
  return {
    country: country || cityCountry(city),
    osmId: `osm_${el.type}${el.id}`, source: 'OpenStreetMap', category, city,
    name: t.name || t['name:ru'] || 'Без названия',
    address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', '),
    phone: firstVal(t.phone || t['contact:phone'] || t.mobile || t['contact:mobile']),
    email: firstVal(t.email || t['contact:email']),
    website: firstVal(t.website || t['contact:website'] || t.url),
    instagram: firstVal(t['contact:instagram'] || t.instagram),
    whatsapp: firstVal(t['contact:whatsapp'] || t.whatsapp),
    telegram: firstVal(t['contact:telegram'] || t.telegram),
    hours: t.opening_hours || '',
    lat: el.lat ?? el.center?.lat, lon: el.lon ?? el.center?.lon,
  };
}
async function searchLeads({ category, city, country = '', limit = 50, onlyContacts = true, nameFilter = '' }) {
  const cat = CATS[category]; if (!cat) throw new Error('Неизвестная ниша');
  country = country || cityCountry(city);
  const g = await geocode(city, country);
  const bbox = `${g.s},${g.w},${g.n},${g.e}`;
  const parts = cat.q.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox});`).join('');
  const query = `[out:json][timeout:25];(${parts});out center tags ${Math.min(Math.max(limit * 4, 100), 800)};`;
  // Опрашиваем все зеркала сразу и берём первый успешный ответ — публичные серверы часто перегружены
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 60000);
  let data;
  try {
    data = await Promise.any(OVERPASS.map(async url => {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (!Array.isArray(j.elements)) throw new Error('bad response');
      return j;
    }));
  } catch { throw new Error('Серверы карт сейчас перегружены — повторите через минуту'); }
  finally { clearTimeout(timer); ac.abort(); }
  let leads = data.elements.map(el => osmToLead(el, category, city, country));
  if (nameFilter) { const f = nameFilter.toLowerCase(); leads = leads.filter(l => l.name.toLowerCase().includes(f)); }
  if (onlyContacts) leads = leads.filter(l => l.phone || l.email || l.website || l.instagram || l.whatsapp || l.telegram);
  leads.forEach(l => { l.score = scoreLead(l); });
  leads.sort((a, b) => b.score - a.score);
  return leads.slice(0, limit);
}

/* История поиска команды — чтобы не искать одно и то же дважды */
const Searches = {
  async add(rec) {
    const row = { ...rec, user_name: Auth.user?.name || '' };
    if (Cloud.on) { await Cloud.sb.from('searches').insert(row); return; }
    LS.set('lf_searches', [{ ...row, user_id: Auth.user?.id, created_at: new Date().toISOString() }, ...LS.get('lf_searches', [])].slice(0, 100));
  },
  async recent() {
    if (Cloud.on) { const { data } = await Cloud.sb.from('searches').select('*').order('created_at', { ascending: false }).limit(40); return data || []; }
    return LS.get('lf_searches', []);
  },
};

/* ---------- ИИ (бесплатные провайдеры) ---------- */
const PROVIDERS = {
  gemini: { label: 'Google Gemini', hint: 'лучшее качество, бесплатно ~250 запросов в день на ключ', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey', prefix: /^(AIza|AQ\.)/ },
  groq: { label: 'Groq (Llama 3.3)', hint: 'очень быстрый, бесплатно ~1000 запросов в день', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', prefix: /^gsk_/ },
  cerebras: { label: 'Cerebras (Llama)', hint: 'бесплатный запасной вариант', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/', prefix: /^csk-/ },
  openrouter: { label: 'OpenRouter (бесплатные модели)', hint: 'запасной вариант', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', prefix: /^sk-or-/ },
};
const PRIORITY = { gemini: 0, groq: 1, cerebras: 2, openrouter: 3 };
const OPENAI_URLS = { groq: 'https://api.groq.com/openai/v1/chat/completions', cerebras: 'https://api.cerebras.ai/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions' };
const guessProvider = key => Object.keys(PROVIDERS).find(p => PROVIDERS[p].prefix.test(String(key).trim())) || '';

/* Ключи ИИ. В облаке — на сервере (сотрудники не видят), в демо-режиме — в этом браузере */
const AIKeys = {
  local() { return LS.get('lf_ai_keys', []); },
  saveLocal(list) { LS.set('lf_ai_keys', list); },
  async list() {
    if (Cloud.on) { const { data, error } = await Cloud.sb.rpc('admin_list_ai_keys'); if (error) throw new Error(error.message); return data; }
    return AIKeys.local().map(k => ({ ...k, masked: k.key.slice(0, 4) + '…' + k.key.slice(-4), key: undefined }));
  },
  async add({ provider, key, model = '', label = '' }) {
    key = String(key).trim(); provider = provider || guessProvider(key);
    if (!PROVIDERS[provider]) throw new Error('Не понял, чей это ключ — выберите провайдера');
    if (key.length < 20) throw new Error('Ключ слишком короткий — скопируйте его целиком');
    if (Cloud.on) { const { error } = await Cloud.sb.rpc('admin_add_ai_key', { p_provider: provider, p_key: key, p_model: model, p_label: label }); if (error) throw new Error(error.message); return; }
    const list = AIKeys.local(); if (list.some(k => k.key === key)) throw new Error('Этот ключ уже добавлен');
    list.push({ id: Date.now(), provider, key, model, label, disabled: false, cooldown_until: null, last_used_at: null, last_error: null, uses: 0, fails: 0 });
    AIKeys.saveLocal(list);
  },
  async remove(id) {
    if (Cloud.on) { const { error } = await Cloud.sb.rpc('admin_delete_ai_key', { p_id: id }); if (error) throw new Error(error.message); return; }
    AIKeys.saveLocal(AIKeys.local().filter(k => k.id !== id));
  },
  async setDisabled(id, disabled) {
    if (Cloud.on) { const { error } = await Cloud.sb.rpc('admin_update_ai_key', { p_id: id, p_disabled: disabled }); if (error) throw new Error(error.message); return; }
    AIKeys.saveLocal(AIKeys.local().map(k => k.id === id ? { ...k, disabled, cooldown_until: null, last_error: disabled ? k.last_error : null } : k));
  },
  async test(id) {
    if (Cloud.on) return invokeAI({ test_key_id: id });
    return runWithKeys([{ role: 'user', content: 'Ответь одной короткой фразой по-русски: ты на связи?' }], 0.5, id);
  },
};

async function callProvider(k, messages, temperature) {
  const tried = new Set(); let model = k.model || PROVIDERS[k.provider].model;
  for (let i = 0; i < 3; i++) {
    tried.add(model);
    try { return await callProviderModel(k, model, messages, temperature); }
    catch (e) {
      const busy = /high demand|overloaded|unavailable|try again later|превышено время/i.test(e.message) || e.status === 503;
      if (k.provider !== 'gemini' || !(busy || /no longer available|not found|is not supported|deprecated|does not exist/i.test(e.message))) throw e;
      const dead = new Set([...String(e.message).matchAll(/models\/([\w.-]+) is (?:no longer|not)/g)].map(m => m[1]));
      const hint = [...String(e.message).matchAll(/models\/([\w.-]+)/g)].map(m => m[1].replace(/\.+$/, "")).find(m => !tried.has(m) && !dead.has(m));
      const next = (busy ? null : hint) || ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash'].find(m => !tried.has(m)); if (!next) throw e;
      model = next; if (!busy) AIKeys.saveLocal(AIKeys.local().map(x => x.id === k.id ? { ...x, model } : x));
    }
  }
  throw new Error('не удалось подобрать модель');
}
async function callProviderModel(k, model, messages, temperature) {
  let r;
  if (k.provider === 'gemini') {
    r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') || ' ' }] },
        contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature } }),
    }, 45000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error?.message || 'HTTP ' + r.status), { status: r.status });
    const t = (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join(''); if (!t) throw Object.assign(new Error('пустой ответ'), { status: 502 }); return t;
  }
  r = await fetchT(OPENAI_URLS[k.provider], { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k.key }, body: JSON.stringify({ model, messages, temperature }) }, 45000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'HTTP ' + r.status), { status: r.status });
  const t = j.choices?.[0]?.message?.content; if (!t) throw Object.assign(new Error('пустой ответ'), { status: 502 }); return t;
}
// Что делать с ключом после ошибки (та же логика, что и на сервере)
function keyVerdict(e) {
  const m = String(e.message).toLowerCase();
  if (e.status === 401 || e.status === 403 || /api key not valid|invalid api key|invalid_api_key|unauthorized|permission denied/.test(m)) return { disable: true, pause: 0 };
  if (e.status === 429 || /quota|rate limit|resource_exhausted|too many/.test(m)) return { pause: /per day|daily|perday/.test(m) ? 3 * 3600e3 : 90e3 };
  return { pause: 30e3 };
}
// Демо-режим: перебираем ключи по очереди, лимитные ставим на паузу, неверные отключаем
async function runWithKeys(messages, temperature, onlyId = null) {
  const now = Date.now();
  const pool = AIKeys.local().filter(k => onlyId ? k.id === onlyId : !k.disabled && !(k.cooldown_until && new Date(k.cooldown_until) > now))
    .sort((a, b) => PRIORITY[a.provider] - PRIORITY[b.provider] || String(a.last_used_at || '').localeCompare(String(b.last_used_at || '')));
  if (!pool.length) throw new Error(AIKeys.local().length ? 'Все ключи ИИ на паузе из-за лимитов — попробуйте через пару минут или добавьте ещё ключ' : 'ИИ не настроен — добавьте бесплатный ключ в Админке → «ИИ»');
  const errors = [];
  for (const k of pool.slice(0, 6)) {
    try {
      const text = await callProvider(k, messages, temperature);
      AIKeys.saveLocal(AIKeys.local().map(x => x.id === k.id ? { ...x, uses: x.uses + 1, last_used_at: new Date().toISOString(), last_error: null, cooldown_until: null, disabled: false } : x));
      return text;
    } catch (e) {
      const v = keyVerdict(e); errors.push(`${PROVIDERS[k.provider].label}: ${e.message}`);
      AIKeys.saveLocal(AIKeys.local().map(x => x.id === k.id ? { ...x, fails: x.fails + 1, last_error: String(e.message).slice(0, 300), disabled: !!v.disable, cooldown_until: v.pause ? new Date(Date.now() + v.pause).toISOString() : null } : x));
    }
  }
  throw new Error('ИИ временно недоступен: ' + errors.join(' | '));
}
async function invokeAI(body) {
  const { data, error } = await Cloud.sb.functions.invoke('ai', { body });
  if (error) {
    let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { /* тело ответа не JSON */ }
    if (/not found|404|failed to send/i.test(msg)) msg = 'ИИ не подключён: администратор должен развернуть функцию ai (Админка → ИИ)';
    throw new Error(msg);
  }
  if (!data?.text) throw new Error('пустой ответ модели');
  return data.text;
}
async function ai(messages, { temperature = 0.7 } = {}) {
  return Cloud.on ? invokeAI({ messages, temperature }) : runWithKeys(messages, temperature);
}

/* ---------- Сообщения ---------- */
function myName() { return Settings.get().myName || Site.get().brand?.name || ''; }
function myIntro() { const s = Settings.get(); const n = myName(); return n ? `Меня зовут ${n}${s.company ? ', ' + s.company : ''}. ` : ''; }
function portfolioUrl() { return Site.get().contacts?.portfolio || ''; }
function templateMessage(lead, channel = 'whatsapp', followup = false) {
  const s = Settings.get(); const cat = (CATS[lead.category]?.label || 'ваши услуги').toLowerCase();
  let t;
  if (followup) {
    t = `Здравствуйте! Напомню о себе — писал(а) недавно по поводу «${lead.name}». Коротко: ${s.offer}. Могу за 10 минут показать 2–3 конкретные идеи для вас бесплатно. Удобно на этой неделе?`;
  } else {
    const hook = !lead.website
      ? `Увидел(а) «${lead.name}» на карте${lead.city ? ' ' + lead.city : ''} и заметил(а), что у вас пока нет своего сайта — люди ищут ${cat} в интернете, и часть из них уходит к конкурентам.`
      : `Посмотрел(а) «${lead.name}» — у вас хорошая основа, и есть пара идей, как получать больше заявок из интернета.`;
    t = `Здравствуйте! ${myIntro()}${hook} Я ${s.offer}.${portfolioUrl() ? ` Примеры работ и цены: ${portfolioUrl()}` : ''} Могу бесплатно подготовить короткий разбор именно для вас — интересно?`;
  }
  if (channel === 'email') t = `Тема: Идея для «${lead.name}»\n\n${t}\n\nС уважением,\n${myName()}${s.company ? '\n' + s.company : ''}${Site.get().contacts?.whatsapp ? '\nWhatsApp: ' + Site.get().contacts.whatsapp : ''}`;
  return t;
}
function renderTemplate(tpl, lead) {
  const s = Settings.get();
  const c = Site.get().contacts || {};
  const map = { name: lead.name, city: lead.city, category: (CATS[lead.category]?.label || lead.category || '').toLowerCase(), address: lead.address, my_name: myName(), company: s.company, offer: s.offer,
    portfolio: c.portfolio, whatsapp: c.whatsapp, price_from: money(minPrice()) };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => map[k] ?? '');
}
async function writeMessage(lead, channel = 'whatsapp', { followup = false, extra = '', lang = '' } = {}) {
  const s = Settings.get(); lang = LANGS[lang] ? lang : (s.lang || 'ru');
  const country = lead.country || cityCountry(lead.city);
  const sys = `Ты — сильный специалист по холодным продажам для малого бизнеса. Пишешь первое сообщение компании от лица пользователя.
Правила: пиши ${LANG_PROMPT[lang]}; до 550 символов; без воды, капслока, смайлов-гирлянд и шаблонных фраз «уникальное предложение»; одно конкретное наблюдение про компанию, одна понятная выгода, мягкий вопрос в конце; тон: ${s.tone}.
${channel === 'email' ? 'Это email: первая строка «Тема: ...», затем пустая строка и текст, в конце подпись.' : 'Это сообщение в мессенджер: без темы и подписи, 2–4 коротких предложения.'}
Верни только текст сообщения, без кавычек и пояснений.`;
  const info = [`Компания: ${lead.name}`, `Ниша: ${CATS[lead.category]?.label || lead.category || 'не указана'}`, `Город: ${lead.city || '—'}`,
    lead.address && `Адрес: ${lead.address}`, `Сайт: ${lead.website || 'нет сайта'}`, lead.instagram && `Instagram: ${lead.instagram}`,
    lead.hours && `Часы работы: ${lead.hours}`, lead.notes && `Заметки: ${lead.notes}`].filter(Boolean).join('\n');
  const user = `${info}

Отправитель: ${myName() || 'не указан'}${s.company ? ', ' + s.company : ''}
Что предлагаю: ${s.offer}
${!country || country === 'Казахстан' ? `Мои цены (называй максимум одну, подходящую этой компании, со словом «от»): ${priceSummary()}` : `Компания из страны «${country}». Цены в тенге не называй — предложи бесплатно рассчитать стоимость.`}
${portfolioUrl() ? `Ссылка на примеры работ и цены (вставь её в сообщение один раз): ${portfolioUrl()}` : ''}
Мой WhatsApp для связи: ${Site.get().contacts?.whatsapp || '—'}
${followup ? `Это повторное касание №${(lead.touches || 1) + 1}: человек не ответил на прошлое сообщение. Будь короче и дай новую причину ответить.` : 'Это первое касание.'}
${extra}`;
  try {
    const text = (await ai([{ role: 'system', content: sys }, { role: 'user', content: user }])).trim().replace(/^["«]+|["»]+$/g, '');
    if (!text) throw new Error('пустой ответ');
    return { text, source: 'ai' };
  } catch (e) {
    return { text: templateMessage(lead, channel, followup), source: 'template', error: e.message };
  }
}

const payBadge = l => { const a = +l.amount || 0, p = +l.paid || 0; if (!a && !p) return '<span class="badge">сумма не указана</span>'; if (p >= a && a) return '<span class="badge ok">оплачено полностью</span>'; if (p > 0) return `<span class="badge warn">предоплата · осталось ${money(a - p)}</span>`; return '<span class="badge bad">не оплачено</span>'; };
/* Счёт: данные зашиты в ссылку (без сервера). Сумма в ссылке только для показа — проверяйте поступление в банке */
const b64u = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function invoiceUrl(l) {
  const no = 'LF-' + (l.invoiceNo || (Date.now() % 1e6).toString().padStart(6, '0'));
  if (!l.invoiceNo) DB.update(l.id, { invoiceNo: no.slice(3) });
  const data = { v: 1, no, c: l.name, s: l.pack || 'Услуги', t: +l.amount, pd: +l.paid || 0, p: Site.get().payTerms?.prepay ?? 50, d: today(), m: Auth.user?.name || '', co: l.country || cityCountry(l.city) || '' };
  return location.href.replace(/[^/]*$/, '') + 'invoice.html#' + b64u(JSON.stringify(data));
}
const LOST_REASONS = ['Дорого', 'Уже есть подрядчик', 'Сейчас не нужно', 'Не отвечает', 'Делают сами', 'Другое'];
const langOpts = l => { const co = COUNTRIES[l.country || cityCountry(l.city)]; const list = co ? co.langs : Object.keys(LANGS); const def = list.includes(Settings.get().lang) ? Settings.get().lang : list[0]; return list.map(k => `<option value="${k}" ${k === def ? 'selected' : ''}>${LANGS[k]}</option>`).join(''); };

/* ---------- Каналы связи ---------- */
/* Телефон в международный формат с учётом страны: KZ +7, UZ +998, KG +996 */
function intlPhone(raw, country = '') {
  let d = String(raw || '').replace(/\D/g, '');
  if (/^(998|996)\d{9}$/.test(d)) return d;
  const cc = COUNTRIES[country]?.code;
  if (d.length === 11 && d[0] === '8' && cc !== '998') d = '7' + d.slice(1);
  if (d.length === 11 && d[0] === '7') return d;
  if (cc && cc !== '7') { if (d.length === 10 && d[0] === '0') return cc + d.slice(1); if (d.length === 9) return cc + d; }
  if (d.length === 10) return '7' + d;
  return d.length >= 10 ? d : '';
}
const leadPhone = (l, alt) => intlPhone(alt ?? l.phone, l.country || cityCountry(l.city));
function hasChannel(lead, ch) {
  if (ch === 'email') return !!lead.email;
  if (ch === 'telegram') return !!(lead.telegram || leadPhone(lead));
  return !!leadPhone(lead, ch === 'whatsapp' ? (lead.whatsapp || lead.phone) : lead.phone);
}
function channelLink(lead, ch, text) {
  if (ch === 'whatsapp') { const p = leadPhone(lead, lead.whatsapp || lead.phone); return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null; }
  if (ch === 'email') {
    if (!lead.email) return null;
    let subject = `Предложение для «${lead.name}»`, body = text;
    const m = text.match(/^Тема:\s*(.+)\n+/); if (m) { subject = m[1].trim(); body = text.slice(m[0].length); }
    return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  if (ch === 'telegram') {
    const tg = String(lead.telegram || '').replace(/^@|^https?:\/\/t\.me\//, '');
    if (tg) return `https://t.me/${tg}`;
    const p = leadPhone(lead); return p ? `https://t.me/+${p}` : null;
  }
  if (ch === 'call') { const p = leadPhone(lead); return p ? `tel:+${p}` : null; }
  return null;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
async function sendVia(lead, ch, text) {
  const link = channelLink(lead, ch, text);
  if (!link) { toast(`У «${lead.name}» нет контакта для канала ${CH_LABEL[ch]}`, 'error'); return false; }
  const copied = await copyText(text);
  if (link.startsWith('mailto:') || link.startsWith('tel:')) location.href = link; else window.open(link, '_blank', 'noopener');
  if (ch === 'telegram' && copied) toast('Текст скопирован — вставьте его в чат Telegram');
  markSent(lead.id, ch, text);
  return true;
}
function markSent(id, ch, text) {
  const l = DB.get(id); if (!l) return;
  const own = l.owner ? {} : { owner: Auth.user?.id || null, ownerName: Auth.user?.name || '' };
  DB.update(id, { ...own, status: l.status === 'new' ? 'contacted' : l.status, touches: (l.touches || 0) + 1, lastContact: new Date().toISOString(), nextFollowUp: addDays(Settings.get().followupDays), draft: '' });
  DB.log(id, 'sent', `${CH_LABEL[ch] || ch}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`);
}

/* ---------- Экспорт ---------- */
const CSV_COLS = ['name', 'category', 'city', 'address', 'phone', 'email', 'website', 'instagram', 'whatsapp', 'telegram', 'status', 'score', 'notes', 'nextFollowUp'];
function leadsToCSV(list) {
  const q = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  return '﻿' + [CSV_COLS.join(','), ...list.map(l => CSV_COLS.map(c => q(c === 'status' ? statusLabel(l[c]) : l[c])).join(','))].join('\n');
}
function download(name, content, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function loadDemo() {
  const city = Settings.get().city;
  return DB.add([
    { name: 'Кофейня «Зерно» (демо)', category: 'cafe', city, address: 'ул. Абая, 10', phone: '+7 700 000 00 01', instagram: 'zerno.demo', hours: 'Mo-Su 08:00-22:00', source: 'демо' },
    { name: 'Барбершоп «Борода» (демо)', category: 'beauty', city, address: 'пр. Достык, 5', phone: '+7 700 000 00 02', website: 'https://example.com', source: 'демо' },
    { name: 'Стоматология «Улыбка» (демо)', category: 'dentist', city, phone: '+7 700 000 00 03', email: 'demo@example.com', source: 'демо', status: 'contacted', touches: 1, nextFollowUp: today() },
    { name: 'Фитнес «Атлет» (демо)', category: 'fitness', city, phone: '+7 700 000 00 04', source: 'демо', status: 'replied' },
    { name: 'Пекарня «Хлеб» (демо)', category: 'bakery', city, email: 'bakery@example.com', source: 'демо', status: 'meeting' },
  ]);
}

/* ---------- Журнал действий: для соревнования и отчётов ---------- */
// В облаке журнал пишет сервер (подделать нельзя), в демо-режиме он собирается из истории лидов
const STATUS_BY_LABEL = Object.fromEntries(STATUSES.map(s => [s.label, s.id]));
const Activity = {
  async range(from, to) {
    if (Cloud.on) {
      const out = [];
      for (let i = 0; ; i += 1000) {
        const { data, error } = await Cloud.sb.from('activity').select('user_id,lead_id,type,value,created_at').gte('created_at', from).lt('created_at', to).order('created_at').range(i, i + 999);
        if (error) throw new Error(error.message);
        out.push(...data.map(r => ({ user: r.user_id, lead: r.lead_id, type: r.type, value: +r.value || 0, at: r.created_at }))); if (data.length < 1000) break;
      }
      return out;
    }
    const out = [];
    for (const l of DB.all()) {
      if (l.createdAt >= from && l.createdAt < to && l.addedById) out.push({ user: l.addedById, lead: l.id, type: 'added', value: 1, at: l.createdAt });
      for (const h of l.history || []) {
        if (h.at < from || h.at >= to) continue;
        if (h.type === 'sent' || h.type === 'call') out.push({ user: h.byId, lead: l.id, type: 'touch', value: 1, at: h.at, kind: h.type });
        else if (h.type === 'status') { const lab = String(h.text).split('→')[1]?.replace(/\(.*\)/, '').trim(); if (STATUS_BY_LABEL[lab]) out.push({ user: l.owner || h.byId, lead: l.id, type: 'status:' + STATUS_BY_LABEL[lab], value: 1, at: h.at }); }
        else if (h.type === 'payment' && h.delta > 0) out.push({ user: h.creditTo || h.byId, lead: l.id, type: 'paid', value: h.delta, at: h.at });
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  },
};

/* ---------- Соревнование: очки за месяц ---------- */
const CONTEST_DEFAULTS = {
  pts: { touch: 1, replied: 3, meeting: 5, won: 20, per10k: 1 }, dailyTouchCap: 60,
  prizes: [50000, 30000, 15000], minPoints: 50,
  rules: 'Очки начисляются автоматически. Клиент засчитывается, только если администратор отметил оплату. Накрутка касаний не поможет: в день засчитывается не больше 60.',
};
const contestCfg = () => { const t = Team.get().contest || {}; return { ...CONTEST_DEFAULTS, ...t, pts: { ...CONTEST_DEFAULTS.pts, ...(t.pts || {}) }, prizes: t.prizes || CONTEST_DEFAULTS.prizes }; };
const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = d => d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()).replace(' г.', '');
// очки и показатели по каждому сотруднику за период
function scoreEvents(events, users) {
  const cfg = contestCfg(); const P = cfg.pts;
  const paidLeads = new Set(DB.all().filter(l => +l.paid > 0).map(l => l.id));
  const rows = new Map(users.map(u => [u.id, { user: u, touches: 0, replied: 0, meeting: 0, won: 0, paid: 0, added: 0, points: 0, perDay: {} }]));
  const seen = new Set();
  for (const e of events) {
    const r = rows.get(e.user); if (!r) continue;
    if (e.type === 'touch') {
      const day = e.at.slice(0, 10); const used = r.perDay[day] || 0; const add = Math.max(0, Math.min(e.value, cfg.dailyTouchCap - used));
      r.perDay[day] = used + e.value; r.touches += e.value; r.points += add * P.touch;
    } else if (e.type === 'added') r.added++;
    else if (e.type === 'paid') { r.paid += e.value; r.points += Math.floor(e.value / 10000) * P.per10k; }
    else if (e.type.startsWith('status:')) {
      const st = e.type.slice(7); const key = `${e.user}|${e.lead}|${st}`; if (seen.has(key)) continue; seen.add(key); // повторный перевод туда-обратно не даёт очков
      if (st === 'replied') { r.replied++; r.points += P.replied; }
      if (st === 'meeting') { r.meeting++; r.points += P.meeting; }
      if (st === 'won' && paidLeads.has(e.lead)) { r.won++; r.points += P.won; }
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.paid - a.paid || b.won - a.won);
}

/* ---------- Excel (.xlsx) без внешних библиотек ---------- */
const XLSX = (() => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = s => new TextEncoder().encode(s);
  const x = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const now = new Date(); const DOS_DATE = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(12, DOS_DATE, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, DOS_DATE, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const size = central.reduce((t, p) => t + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  // sheets: [{ name, rows: [[...]], widths: [..] }] — первая строка листа станет жирной шапкой
  function build(sheets) {
    const names = new Set();
    sheets = sheets.map(sh => { let n = String(sh.name).replace(/[\[\]:*?/\\']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Лист'; while (names.has(n)) n = n.slice(0, 28) + '_' + names.size; names.add(n); return { ...sh, name: n }; });
    const files = [];
    files.push({ name: '[Content_Types].xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) });
    files.push({ name: '_rels/.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
    files.push({ name: 'xl/workbook.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
    files.push({ name: 'xl/styles.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E6B50"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>`) });
    sheets.forEach((sh, si) => {
      const head = sh.headerRow ?? 0;
      const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = col(ci) + (ri + 1);
        const style = ri === head ? ' s="1"' : (sh.titleRow === ri ? ' s="3"' : '');
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${style || (Math.abs(v) >= 1000 ? ' s="2"' : '')}><v>${v}</v></c>`;
        if (v === '' || v == null) return '';
        return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const widths = sh.widths || sh.rows[head]?.map(() => 18) || [];
      files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${head + 1}" topLeftCell="A${head + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`) });
    });
    return zip(files);
  }
  return { build };
})();
function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* ---------- UI: навигация, тосты, карточка лида ---------- */
/* ---------- Авторизация по email: облако Supabase или локальный режим ---------- */
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e));
const OWNER_EMAIL = normEmail(CFG.ownerEmail);
const MAX_USERS = CFG.maxUsers || 10;
const STATUS_TEXT = { pending: 'Заявка ждёт подтверждения администратора. Как только он её одобрит, вы сможете войти.', disabled: 'Доступ отключён администратором.' };
const authError = m => {
  if (/invalid login|invalid credentials/i.test(m)) return 'Неверный email или пароль';
  if (/already registered|already exists/i.test(m)) return 'Этот email уже зарегистрирован — войдите';
  if (/password should be|weak/i.test(m)) return 'Пароль слишком простой: минимум 8 символов';
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток. Подождите минуту';
  if (/failed to fetch|network/i.test(m)) return 'Нет соединения с сервером. Проверьте интернет';
  return m;
};
const Auth = {
  user: null, status: '',
  async init() {
    Auth.user = null; Auth.status = '';
    if (Cloud.on) {
      const { data } = await Cloud.sb.auth.getSession();
      const su = data.session?.user; if (!su) return null;
      const { data: p, error } = await Cloud.sb.from('profiles').select('id,name,role,status').eq('id', su.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!p) return null;
      if (p.status !== 'active') { Auth.status = p.status; await Cloud.sb.auth.signOut(); return null; }
      Auth.user = { id: p.id, name: p.name || su.email.split('@')[0], email: su.email, role: p.role };
      return Auth.user;
    }
    const sess = LS.get('lf_session', null); const u = Local.users().find(x => x.id === sess?.id);
    if (!u || !sess || sess.exp < Date.now()) return null;
    if (u.status !== 'active') { Auth.status = u.status; LS.set('lf_session', null); return null; }
    Auth.user = { id: u.id, name: u.name, email: u.email, role: u.role };
    return Auth.user;
  },
  async login(email, password) {
    email = normEmail(email); Auth.status = '';
    if (Cloud.on) {
      const { error } = await Cloud.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(authError(error.message));
    } else {
      const u = Local.users().find(x => x.email === email);
      if (!u || u.hash !== await sha256(`lf:${u.email}:${password}`)) { await new Promise(r => setTimeout(r, 600)); throw new Error('Неверный email или пароль'); }
      if (u.status !== 'active') { Auth.status = u.status; throw new Error(STATUS_TEXT[u.status]); }
      LS.set('lf_session', { id: u.id, exp: Date.now() + 30 * 864e5 }); await Local.patch(u.id, { last_login: new Date().toISOString() });
    }
    if (!await Auth.init()) throw new Error(STATUS_TEXT[Auth.status] || 'Профиль не найден — обратитесь к администратору');
  },
  // возвращает 'active' (можно входить) или 'pending' (ждёт одобрения)
  async register({ email, name, password }) {
    email = normEmail(email);
    if (Cloud.on) {
      const { error } = await Cloud.sb.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw new Error(authError(error.message));
      await Auth.init();
      if (Auth.user) return 'active';
      return Auth.status || 'pending';
    }
    if (Local.users().some(u => u.email === email)) throw new Error('Этот email уже зарегистрирован — войдите');
    const owner = email === OWNER_EMAIL;
    await Local.create({ email, name, password, role: owner ? 'admin' : 'member', status: owner ? 'active' : 'pending' });
    if (!owner) return 'pending';
    await Auth.login(email, password); return 'active';
  },
  async logout() { try { await Cloud.flush(); if (Cloud.on) { await IDB.set(Cloud.cacheKey(), null).catch(() => {}); await Cloud.sb.auth.signOut(); } } finally { LS.set('lf_session', null); LS.set('lf_nav_user', null); location.href = 'index.html'; } },
  async changePassword(oldPass, newPass) {
    if (Cloud.on) {
      const { error: e1 } = await Cloud.sb.auth.signInWithPassword({ email: Auth.user.email, password: oldPass });
      if (e1) throw new Error('Текущий пароль неверный');
      const { error } = await Cloud.sb.auth.updateUser({ password: newPass }); if (error) throw new Error(authError(error.message)); return;
    }
    const u = Local.users().find(x => x.id === Auth.user.id);
    if (u.hash !== await sha256(`lf:${u.email}:${oldPass}`)) throw new Error('Текущий пароль неверный');
    await Local.patch(u.id, { password: newPass });
  },
  // имена коллег для статистики (доступно всем сотрудникам)
  async team() {
    if (Cloud.on) { const { data, error } = await Cloud.sb.from('profiles').select('id,name,role,status').eq('status', 'active'); if (error) throw new Error(error.message); return data; }
    return Local.users().filter(u => u.status === 'active').map(({ id, name, role, status }) => ({ id, name, role, status }));
  },
  // ---- только для администратора ----
  async listUsers() {
    if (Cloud.on) { const { data, error } = await Cloud.sb.rpc('admin_list_users'); if (error) throw new Error(error.message); return data; }
    return Local.users().map(({ hash, ...u }) => u);
  },
  async setStatus(id, status) {
    if (id === Auth.user.id) throw new Error('Нельзя изменить свой собственный доступ');
    if (status === 'active' && (await Auth.listUsers()).filter(u => u.status === 'active').length >= MAX_USERS) throw new Error(`Лимит: не больше ${MAX_USERS} активных сотрудников`);
    if (Cloud.on) { const { error } = await Cloud.sb.from('profiles').update({ status }).eq('id', id); if (error) throw new Error(error.message); return; }
    await Local.patch(id, { status });
  },
  async setPassword(id, password) {
    if (password.length < 8) throw new Error('Пароль должен быть не короче 8 символов');
    if (Cloud.on) { const { error } = await Cloud.sb.rpc('admin_set_password', { uid: id, new_password: password }); if (error) throw new Error(error.message); return; }
    await Local.patch(id, { password });
  },
  async remove(id) {
    if (id === Auth.user.id) throw new Error('Нельзя удалить свой аккаунт');
    if (Cloud.on) { const { error } = await Cloud.sb.rpc('admin_delete_user', { uid: id }); if (error) throw new Error(error.message); return; }
    LS.set('lf_users', Local.users().filter(u => u.id !== id));
  },
};
/* Локальный режим: аккаунты в этом браузере (только для проверки, пароли хранятся как хэш) */
const Local = {
  users() { return LS.get('lf_users', []); },
  async create({ email, name, password, role, status }) {
    const users = Local.users();
    users.push({ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), email, name: (name || email.split('@')[0]).slice(0, 60), role, status, hash: await sha256(`lf:${email}:${password}`), created_at: new Date().toISOString() });
    LS.set('lf_users', users);
  },
  async patch(id, p) {
    const users = Local.users(); const u = users.find(x => x.id === id); if (!u) return;
    if (p.password) u.hash = await sha256(`lf:${u.email}:${p.password}`);
    if (p.last_login) u.last_login = p.last_login;
    if (p.status) { if (u.role === 'admin' && p.status !== 'active') throw new Error('Главный аккаунт нельзя отключить'); u.status = p.status; }
    LS.set('lf_users', users);
  },
};

/* Небольшая обёртка над IndexedDB (в localStorage большая база не поместится) */
const IDB = {
  db: null,
  open() { return IDB.db || (IDB.db = new Promise((res, rej) => { const r = indexedDB.open('leadflow', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { const db = await IDB.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await IDB.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
};

/* ---------- Облако: общая база лидов и настроек ---------- */
const Cloud = {
  configured: !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
  on: !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase),
  sb: null, pending: new Map(), timer: null,
  init() { if (Cloud.on) Cloud.sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey); },
  async loadConfig(keys) {
    const { data, error } = await Cloud.sb.from('app_config').select('key,data').in('key', keys);
    if (error) return;
    for (const r of data) { if (r.key === 'site') Site.data = { ...(window.SITE_DEFAULT || {}), ...r.data }; if (r.key === 'team') Team.data = r.data; }
  },
  async saveConfig(key, data) { const { error } = await Cloud.sb.from('app_config').upsert({ key, data, updated_at: new Date().toISOString() }); if (error) throw new Error(error.message); },
  // База кэшируется в браузере (IndexedDB), из облака докачиваются только изменения — экономит трафик бесплатного тарифа
  lastTs: null, fullAt: 0,
  cacheKey: () => 'leads:' + CFG.supabaseUrl,
  async loadLeads() {
    const cached = await IDB.get(Cloud.cacheKey()).catch(() => null);
    const map = new Map(); let since = null;
    if (cached?.rows && cached.since && Date.now() - cached.fullAt < 7 * 864e5) { cached.rows.forEach(l => map.set(l.id, l)); since = cached.since; Cloud.fullAt = cached.fullAt; }
    else Cloud.fullAt = Date.now();
    let maxTs = since;
    for (let from = 0; ; from += 1000) {
      let q = Cloud.sb.from('leads').select('id,data,updated_at').order('updated_at', { ascending: true }).range(from, from + 999);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of data) { if (r.data?.deleted) map.delete(r.id); else map.set(r.id, { ...r.data, id: r.id }); if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at; }
      if (data.length < 1000) break;
    }
    Cloud.lastTs = maxTs;
    CACHE = [...map.values()].sort((x, y) => String(y.updatedAt || y.createdAt || '').localeCompare(String(x.updatedAt || x.createdAt || '')));
    Cloud.saveCache();
  },
  saveCache() {
    clearTimeout(Cloud._ct);
    Cloud._ct = setTimeout(() => { if (CACHE && Cloud.lastTs) IDB.set(Cloud.cacheKey(), { rows: CACHE, since: Cloud.lastTs, fullAt: Cloud.fullAt }).catch(() => {}); }, 800);
  },
  // администратор: окончательно удалить из облака лидов, удалённых больше 30 дней назад
  async purgeDeleted() {
    const { data, error } = await Cloud.sb.from('leads').select('id,data').eq('data->>deleted', 'true');
    if (error) throw new Error(error.message);
    const old = (data || []).filter(r => Date.now() - new Date(r.data.deletedAt || 0) > 30 * 864e5).map(r => r.id);
    for (let i = 0; i < old.length; i += 200) { const { error: e } = await Cloud.sb.from('leads').delete().in('id', old.slice(i, i + 200)); if (e) throw new Error(e.message); }
    return old.length;
  },
  queue(changed, deleted) {
    changed.forEach(l => Cloud.pending.set(l.id, l)); deleted.forEach(id => Cloud.pending.set(id, null));
    clearTimeout(Cloud.timer); Cloud.timer = setTimeout(Cloud.flush, 300);
  },
  async flush() {
    if (!Cloud.pending.size) return;
    const items = [...Cloud.pending.entries()]; Cloud.pending.clear();
    const up = items.filter(([, v]) => v).map(([id, l]) => ({ id, data: l, owner: l.owner || null, updated_by: Auth.user?.id, updated_at: new Date().toISOString() }));
    const del = items.filter(([, v]) => !v).map(([id]) => id);
    const denied = [];
    try {
      for (let i = 0; i < up.length; i += 200) {
        const chunk = up.slice(i, i + 200);
        const { error } = await Cloud.sb.from('leads').upsert(chunk);
        if (!error) continue;
        if (error.code !== '42501') throw error;
        // в пачке есть чужой лид — сохраняем по одному, чужие откатываем
        for (const row of chunk) { const { error: e } = await Cloud.sb.from('leads').upsert(row); if (e) { if (e.code === '42501') denied.push(row.id); else throw e; } }
      }
      if (del.length) { const { error } = await Cloud.sb.from('leads').delete().in('id', del); if (error) throw error; }
      setSync('ok');
    } catch (e) {
      items.forEach(([id, v]) => { if (!Cloud.pending.has(id) && !denied.includes(id)) Cloud.pending.set(id, v); });
      setSync('err'); toast('Нет связи с облаком — изменения сохранятся автоматически, как только связь появится', 'error');
      Cloud.timer = setTimeout(Cloud.flush, 10000);
    }
    if (denied.length) {
      toast(denied.length === 1 ? 'Этого лида уже ведёт коллега — изменение отменено' : `Изменения ${denied.length} лидов отменены: их ведут коллеги`, 'error');
      const { data } = await Cloud.sb.from('leads').select('id,data').in('id', denied);
      (data || []).forEach(r => DB.applyRemote({ ...r.data, id: r.id }));
    }
  },
  subscribe() {
    Cloud.sb.channel('leads-live').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, p => {
      if (p.new?.updated_at && (!Cloud.lastTs || p.new.updated_at > Cloud.lastTs)) Cloud.lastTs = p.new.updated_at;
      if (p.eventType === 'DELETE') DB.applyRemote(null, p.old.id);
      else if (p.new?.data?.deleted) DB.applyRemote(null, p.new.id);
      else if (p.new?.data && p.new.updated_by !== Auth.user?.id && !Cloud.pending.has(p.new.id)) DB.applyRemote({ ...p.new.data, id: p.new.id });
    }).subscribe();
  },
};
function setSync(state) { const el = $('#sync'); if (el) { el.className = 'sync ' + state; el.title = state === 'ok' ? 'Все изменения сохранены в облаке' : 'Есть несохранённые изменения'; } }
window.addEventListener('pagehide', () => Cloud.on && Cloud.flush());
window.addEventListener('beforeunload', e => { if (Cloud.pending.size) { Cloud.flush(); e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', () => Cloud.on && Cloud.flush());
document.addEventListener('visibilitychange', () => document.hidden && Cloud.on && Cloud.flush());

/* ---------- UI: навигация, тосты, карточка лида ---------- */
const NAV = [['home.html', 'Сегодня'], ['leads.html', 'Поиск'], ['crm.html', 'CRM'], ['outreach.html', 'Рассылка'], ['agent.html', 'ИИ-агент'], ['prices.html', 'Цены'], ['rating.html', 'Рейтинг'], ['admin.html', 'Админка', 'admin']];
function renderFooter() {
  const s = Site.get(); const links = contactLinks();
  $('body > footer')?.remove();
  const f = document.createElement('footer');
  f.innerHTML = `<div class="wrap foot">
    <div><b>${esc(s.brand?.name || '')}</b> — ${esc(s.brand?.title || '')}<br><span>${esc(s.brand?.area || '')}</span></div>
    <div class="foot-links">${links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span>${esc(l.value)}</a>`).join('')}</div>
    <div class="foot-meta">© ${new Date().getFullYear()} ${esc(s.brand?.name || '')}. ${esc(s.brand?.priceNote || '')}</div></div>`;
  document.body.append(f);
  const wa = links.find(l => l.k === 'whatsapp');
  if (wa && !$('.wa-float')) document.body.insertAdjacentHTML('beforeend', `<a class="wa-float" href="${esc(wa.href)}" target="_blank" rel="noopener" aria-label="Написать в WhatsApp"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg></a>`);
}
function renderNav(u = Auth.user) {
  const cur = location.pathname.split('/').pop() || 'index.html';
  $('body > header.topbar')?.remove(); $('.localbar')?.remove();
  const h = document.createElement('header'); h.className = 'topbar';
  const items = u ? NAV.filter(n => !n[2] || u.role === n[2]) : [['services.html', 'Цены и примеры'], ['index.html', 'Войти']];
  h.innerHTML = `<div class="wrap topbar-in"><a class="brand" href="${u ? 'home.html' : 'services.html'}"><span class="logo">LF</span>LeadFlow</a>
    <button class="menu-btn" aria-label="Открыть меню" aria-expanded="false">☰</button>
    <nav>${items.map(([p, t]) => `<a href="${p}"${p === cur ? ' class="active" aria-current="page"' : ''}>${t}</a>`).join('')}
    ${u ? `<a href="settings.html" class="me${cur === 'settings.html' ? ' active' : ''}" title="Мой профиль">${Cloud.on ? '<i id="sync" class="sync ok"></i>' : ''}${esc(u.name)}</a><a href="#" id="logout">Выйти</a>` : ''}</nav></div>`;
  document.body.prepend(h);
  if (u && !Cloud.on) h.insertAdjacentHTML('afterend', `<div class="localbar">Локальный режим: аккаунты и лиды хранятся только в этом браузере. Чтобы работала вся команда, подключите облако — ${u.role === 'admin' ? '<a href="admin.html#cloud">инструкция в админке</a>' : 'попросите администратора'}.</div>`);
  const b = $('.menu-btn', h); b.onclick = () => { const o = h.classList.toggle('open'); b.setAttribute('aria-expanded', o); };
  $('#logout') && ($('#logout').onclick = e => { e.preventDefault(); Auth.logout(); });
  if (u === Auth.user) refreshBadge();
}
/* У администратора — счётчик новых заявок рядом с «Админкой» */
async function refreshBadge() {
  if (Auth.user?.role !== 'admin') return;
  try {
    const n = (await Auth.listUsers()).filter(u => u.status === 'pending').length;
    const a = $('.topbar nav a[href="admin.html"]'); if (!a) return;
    $('.nav-badge', a)?.remove(); if (n) a.insertAdjacentHTML('beforeend', ` <span class="nav-badge" title="Новые заявки">${n}</span>`);
  } catch { /* не критично */ }
}
function toast(msg, type = '') {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.append(t);
  const close = () => { if (t.classList.contains('out')) return; t.style.height = t.offsetHeight + 'px'; t.classList.add('out'); requestAnimationFrame(() => { t.style.height = '0px'; }); setTimeout(() => t.remove(), 300); };
  t.onclick = close; if (box.children.length > 3) box.firstElementChild !== t && box.firstElementChild.click();
  setTimeout(close, type === 'error' ? 6000 : 3500);
}
/* ---------- Анимации интерфейса ---------- */
// повторно проиграть анимацию появления у элемента (смена вкладки, вида и т. п.)
function replay(el, cls = 'panel-in') { if (!el || calm()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
// скользящая подложка у переключателей .seg
function updateSegs() {
  $$('.seg').forEach(seg => {
    const on = $('button.on', seg); let pill = $('.seg-pill', seg);
    if (!on || seg.offsetParent === null) return;
    if (!pill) { pill = document.createElement('i'); pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true'); seg.prepend(pill); seg.classList.add('has-pill'); pill.style.transition = 'none'; }
    pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`;
    requestAnimationFrame(() => { pill.style.transition = ''; });
  });
}
document.addEventListener('click', e => { if (e.target.closest('.seg')) requestAnimationFrame(updateSegs); });
window.addEventListener('resize', () => requestAnimationFrame(updateSegs));
// волна от точки нажатия на кнопках
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn, .chip'); if (!b || b.disabled || calm()) return;
  const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.append(s); setTimeout(() => s.remove(), 600);
});
// появление блоков при прокрутке
const revealObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); revealObs.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
function reveal(els) { els.forEach(el => { if (!revealObs || calm()) { el.classList.add('in'); return; } el.classList.add('reveal'); revealObs.observe(el); }); }

/* Плавный счёт чисел при первом показе страницы */
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// числа в карточках-счётчиках плавно идут от прошлого значения к новому
const lastNums = new Map();
function countUp(root = document) {
  $$('.stat', root).forEach(card => {
    const el = $('b', card); const key = location.pathname + '|' + ($('span', card)?.textContent || '');
    const m = el.textContent.match(/^(\d+)(.*)$/s); if (!m) return;
    const to = +m[1], rest = m[2], from = lastNums.has(key) ? lastNums.get(key) : 0; lastNums.set(key, to);
    if (from === to || calm()) return;
    if (lastNums.size && from !== 0) { card.classList.remove('changed'); void card.offsetWidth; card.classList.add('changed'); }
    const t0 = performance.now(); el.textContent = from + rest;
    const step = now => { const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e) + rest; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
/* FLIP: элементы плавно переезжают на новое место после перерисовки списка (канбан, таблицы) */
function flip(container, selector, mutate) {
  if (!container || calm()) { mutate(); return; }
  const before = new Map($$(selector, container).map(el => [el.dataset.id, el.getBoundingClientRect()]));
  mutate();
  $$(selector, container).forEach(el => {
    const old = before.get(el.dataset.id); if (!old) return;
    const now = el.getBoundingClientRect(); const dx = old.left - now.left, dy = old.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}
/* Плавная смена высоты блока при замене содержимого */
function morphHeight(el, mutate) {
  if (!el || calm()) { mutate(); return; }
  const h0 = el.offsetHeight; mutate(); const h1 = el.offsetHeight;
  if (Math.abs(h1 - h0) < 2) return;
  el.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
/* Плавный уход со страницы при переходе по внутренним ссылкам */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank' || a.hasAttribute('download') || calm()) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !/\.html$/.test(url.pathname) || (url.pathname === location.pathname && url.hash)) return;
  if (Cloud.pending.size) Cloud.flush();
  e.preventDefault(); document.body.classList.add('leaving');
  setTimeout(() => { location.href = url.href; }, 170);
});
window.addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });
/* Тень у шапки при прокрутке */
let scrolledTick = false;
window.addEventListener('scroll', () => { if (scrolledTick) return; scrolledTick = true; requestAnimationFrame(() => { $('.topbar')?.classList.toggle('scrolled', scrollY > 8); scrolledTick = false; }); }, { passive: true });
function contactBadges(l) {
  return [l.phone && '<span class="badge ok">тел</span>', l.email && '<span class="badge ok">email</span>', (l.whatsapp) && '<span class="badge ok">WA</span>',
    l.telegram && '<span class="badge ok">TG</span>', l.instagram && '<span class="badge info">insta</span>',
    l.website ? '<span class="badge">сайт</span>' : '<span class="badge warn">нет сайта</span>'].filter(Boolean).join('');
}
const ownerBadge = l => l.owner ? `<span class="badge ${isMine(l) ? 'ok' : 'info'}" title="Ведёт">${isMine(l) ? 'мой' : esc(l.ownerName || 'коллега')}</span>` : '';
const safeUrl = u => { if (!String(u || '').trim()) return ''; try { const x = new URL(String(u).trim(), location.href); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
function extUrl(v, kind) {
  if (!v) return '';
  if (kind === 'ig' && !/^https?:/.test(v)) return 'https://instagram.com/' + v.replace(/^@/, '');
  return safeUrl(/^https?:/i.test(v) ? v : 'https://' + v);
}
let lastFocus = null;
function closeDrawer() {
  const d = $('#drawer'); if (!d || d.classList.contains('closing')) return;
  document.removeEventListener('keydown', drawerKeys);
  d.classList.add('closing'); setTimeout(() => d.remove(), calm() ? 0 : 220);
  lastFocus?.focus?.();
}
function drawerKeys(e) { if (e.key === 'Escape') closeDrawer(); }
function openLead(id, onChange = () => {}) {
  const wasOpen = !!$('#drawer:not(.closing)'); if (!wasOpen) lastFocus = document.activeElement;
  const keepScroll = wasOpen ? $('#drawer .drawer-body')?.scrollTop || 0 : 0;
  $$('.drawer-wrap').forEach(d => d.remove()); document.removeEventListener('keydown', drawerKeys);
  const l = DB.get(id); if (!l) { toast('Лид не найден — возможно, его удалили', 'error'); return; }
  const kv = (k, v, href) => v ? `<dt>${k}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</dd>` : '';
  const chOpts = ['whatsapp', 'email', 'telegram'].map(c => `<option value="${c}" ${hasChannel(l, c) ? '' : 'disabled'}>${CH_LABEL[c]}${hasChannel(l, c) ? '' : ' — нет контакта'}</option>`).join('');
  const packs = Site.get().packs || [];
  const country = l.country || cityCountry(l.city); const gis = COUNTRIES[country]?.gis || '2gis.kz';
  const q = encodeURIComponent(`${l.name} ${l.city || ''}`.trim());
  const mapLinks = `<div class="row gap wrap-row small"><a class="btn" href="https://${gis}/search/${q}" target="_blank" rel="noopener">Открыть в 2ГИС</a><a class="btn" href="${l.lat ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lon}` : `https://www.google.com/maps/search/?api=1&query=${q}`}" target="_blank" rel="noopener">Google Карты</a><a class="btn" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Найти в Google</a></div>`;
  const isAdmin = Auth.user?.role === 'admin';
  const w = document.createElement('div'); w.className = 'drawer-wrap'; w.id = 'drawer';
  if (wasOpen) w.classList.add('instant');
  w.innerHTML = `<div class="drawer-bg" data-close></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <div class="drawer-head"><div class="grow"><h2 id="dTitle">${esc(l.name)}</h2>
      <div class="muted small">${esc(CATS[l.category]?.label || l.category || 'Без ниши')}${l.city ? ' · ' + esc(l.city) : ''}${l.address ? ' · ' + esc(l.address) : ''}</div></div>
      <button class="icon-btn" data-close aria-label="Закрыть карточку">✕</button></div>
    <div class="drawer-body stack">
      ${ownedByOther(l) ? `<div class="notice" style="margin:0"><span class="grow">Этого лида ведёт <b>${esc(l.ownerName || 'коллега')}</b>. Не пишите ему без договорённости.</span>${isAdmin ? '<button class="btn" id="dTake">Забрать себе</button>' : ''}</div>` : ''}
      <div class="row gap wrap-row" style="align-items:flex-end">
        <div><div class="small muted" style="font-weight:600;margin-bottom:6px">Оценка</div><span class="score ${scoreClass(l.score)}">${l.score}</span></div>
        <label class="grow">Статус<select id="dStatus">${STATUSES.map(s => `<option value="${s.id}" ${s.id === l.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
        <label>Напомнить<input type="date" id="dFollow" value="${esc(l.nextFollowUp || '')}"></label>
      </div>
      <div class="row gap wrap-row" style="align-items:flex-end">
        <div class="grow small"><span class="muted">Ведёт:</span> <b>${l.owner ? esc(isMine(l) ? 'вы' : l.ownerName) : 'никто'}</b>${l.addedBy ? ` <span class="muted">· добавил(а) ${esc(l.addedBy)}</span>` : ''}</div>
        ${!l.owner ? '<button class="btn" id="dClaim">Взять себе</button>' : isMine(l) ? '<button class="btn" id="dRelease">Освободить</button>' : ''}
      </div>
      <div class="row gap wrap-row" style="align-items:flex-end">
        <label class="grow">Услуга<select id="dPack"><option value="">— не выбрана —</option>${packs.map(p => `<option ${l.pack === p.name ? 'selected' : ''} data-price="${+p.price || 0}">${esc(p.name)}</option>`).join('')}</select></label>
        <label>Сумма сделки, ₸<input type="number" id="dAmount" min="0" step="1000" value="${+l.amount || ''}" style="width:150px"></label>
      </div>
      <div class="pay-box">
        <div class="row gap wrap-row" style="align-items:flex-end">
          ${isAdmin ? `<label>Оплачено, ₸<input type="number" id="dPaid" min="0" step="1000" value="${+l.paid || ''}" style="width:150px"></label>` : `<div class="small"><span class="muted">Оплачено:</span> <b>${money(+l.paid || 0)}</b><br><span class="muted">оплату отмечает администратор</span></div>`}
          <div class="grow">${payBadge(l)}</div>
          <button class="btn" id="dInvoice" ${+l.amount ? '' : 'title="Сначала укажите сумму сделки"'}>Счёт клиенту</button>
        </div>
        ${+l.amount ? `<div class="paybar" aria-hidden="true"><i style="width:${Math.min(100, Math.round((+l.paid || 0) / l.amount * 100))}%"></i></div>` : ''}
      </div>
      ${l.status === 'lost' ? `<label>Причина отказа<select id="dLost"><option value="">— не указана —</option>${LOST_REASONS.map(r => `<option ${l.lostReason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>` : ''}
      ${mapLinks}
      <dl class="kv">${kv('Телефон', l.phone, l.phone && 'tel:' + l.phone.replace(/[^\d+]/g, ''))}${kv('Email', l.email, l.email && 'mailto:' + l.email)}${kv('Сайт', l.website, extUrl(l.website))}${kv('Instagram', l.instagram, extUrl(l.instagram, 'ig'))}${kv('WhatsApp', l.whatsapp)}${kv('Telegram', l.telegram)}${kv('Часы', l.hours)}${kv('Источник', l.source)}${kv('Касаний', String(l.touches || 0))}</dl>
      <details><summary>Изменить контакты</summary><div class="stack">${['phone:Телефон', 'whatsapp:WhatsApp', 'email:Email', 'telegram:Telegram', 'instagram:Instagram', 'website:Сайт'].map(x => { const [k, t] = x.split(':'); return `<label>${t}<input data-c="${k}" value="${esc(l[k] || '')}"></label>`; }).join('')}<button class="btn" id="dSaveC">Сохранить контакты</button></div></details>
      <label>Заметки<textarea id="dNotes" rows="3" placeholder="Кто принимает решение, что обсуждали, возражения…">${esc(l.notes)}</textarea></label>
      <div class="msg-box stack">
        <div class="row gap wrap-row"><h3 class="grow" style="margin:0">Сообщение</h3><select id="dCh" style="width:auto" aria-label="Канал">${chOpts}</select><select id="dLang" style="width:auto" aria-label="Язык">${langOpts(l)}</select><button class="btn" id="dGen">Написать с ИИ</button></div>
        <textarea id="dMsg" rows="7" placeholder="Нажмите «Написать с ИИ» или введите текст сами">${esc(l.draft || '')}</textarea>
        <div class="row gap wrap-row"><button class="btn primary" id="dSend">Отправить</button><button class="btn" id="dCopy">Скопировать</button>${l.phone ? `<a class="btn" href="tel:+${leadPhone(l)}" id="dCall">Позвонить</a>` : ''}<span class="muted small" id="dSrc"></span></div>
      </div>
      <div><h3>История</h3><ul class="history">${(l.history || []).map(h => `<li><span class="muted">${new Date(h.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${h.by ? ' · ' + esc(h.by) : ''}</span> — ${esc(h.text)}</li>`).join('') || '<li class="muted">Пока нет касаний</li>'}</ul></div>
      ${isAdmin ? `<div><button class="btn danger" id="dDel">Удалить «${esc(l.name)}»</button></div>` : ''}
    </div>
  </aside>`;
  document.body.append(w);
  if (keepScroll) $('.drawer-body', w).scrollTop = keepScroll;
  document.addEventListener('keydown', drawerKeys);
  $$('[data-close]', w).forEach(b => b.onclick = closeDrawer);
  const firstCh = ['whatsapp', 'email', 'telegram'].find(c => hasChannel(l, c)); if (firstCh) $('#dCh').value = firstCh;
  if (!wasOpen) $('[aria-label="Закрыть карточку"]', w).focus({ preventScroll: true });
  // чужого лида сотрудник только смотрит (то же правило проверяет база)
  if (ownedByOther(l) && !isAdmin) $$('.drawer-body select, .drawer-body input, .drawer-body textarea, .drawer-body button', w).forEach(el => { if (el.id !== 'dCopy') el.disabled = true; });
  const refresh = () => { onChange(); openLead(id, onChange); };
  const on = (sel, ev, fn) => { const el = $(sel, w); if (el) el[ev] = fn; };
  on('#dTake', 'onclick', () => { claim(id); refresh(); });
  on('#dClaim', 'onclick', () => { claim(id); toast('Лид закреплён за вами'); refresh(); });
  on('#dRelease', 'onclick', () => { release(id); refresh(); });
  on('#dStatus', 'onchange', e => {
    const st = e.target.value; const patch = { status: st };
    if (!DB.get(id).owner) Object.assign(patch, { owner: Auth.user.id, ownerName: Auth.user.name });
    if (st === 'won' && !+DB.get(id).amount) { const p = $('#dPack').selectedOptions[0]; if (p?.dataset.price) patch.amount = +p.dataset.price; }
    if (st === 'won' || st === 'lost') patch.nextFollowUp = null;
    DB.update(id, patch); DB.log(id, 'status', `Статус → ${statusLabel(st)}`); refresh();
  });
  on('#dPack', 'onchange', e => { const o = e.target.selectedOptions[0]; const patch = { pack: e.target.value }; if (o?.dataset.price && !+$('#dAmount').value) { patch.amount = +o.dataset.price; $('#dAmount').value = patch.amount; } DB.update(id, patch); onChange(); });
  on('#dPaid', 'onchange', e => {
    const cur = DB.get(id); const paid = Math.max(0, +e.target.value || 0); const prev = +cur.paid || 0;
    DB.update(id, { paid, ...(paid >= (+cur.amount || Infinity) && !['won'].includes(cur.status) ? { status: 'won', nextFollowUp: null } : {}) });
    if (paid !== prev) DB.log(id, 'payment', `Оплата: ${money(paid)}${+cur.amount ? ` из ${money(cur.amount)}` : ''}`, { delta: paid - prev, creditTo: cur.owner || Auth.user.id });
    toast(paid >= (+cur.amount || Infinity) ? 'Оплачено полностью — сделка закрыта 🎉' : 'Оплата сохранена'); refresh();
  });
  on('#dInvoice', 'onclick', async () => {
    const cur = DB.get(id); if (!+cur.amount) { toast('Сначала укажите сумму сделки', 'error'); $('#dAmount').focus(); return; }
    const url = invoiceUrl(cur); await copyText(url);
    const prepay = Site.get().payTerms?.prepay ?? 50;
    const text = `Здравствуйте! Счёт на оплату «${cur.pack || 'услуги'}» — ${money(cur.amount)}${prepay ? ` (предоплата ${prepay}%: ${money(Math.round(cur.amount * prepay / 100))})` : ''}. Реквизиты и детали: ${url}`;
    $('#dMsg').value = text; DB.update(id, { draft: text }); DB.log(id, 'invoice', `Счёт на ${money(cur.amount)}`);
    toast('Ссылка на счёт скопирована и вставлена в сообщение — нажмите «Отправить»');
    replay($('#dMsg').closest('.msg-box'));
  });
  on('#dAmount', 'onchange', e => { DB.update(id, { amount: +e.target.value || 0 }); onChange(); toast('Сумма сохранена'); });
  on('#dSaveC', 'onclick', () => { const p = {}; $$('[data-c]', w).forEach(i => p[i.dataset.c] = i.value.trim()); const n = { ...DB.get(id), ...p }; p.score = scoreLead(n); DB.update(id, p); DB.log(id, 'edit', 'Контакты обновлены'); refresh(); });
  on('#dLost', 'onchange', e => { DB.update(id, { lostReason: e.target.value }); onChange(); toast('Причина сохранена'); });
  on('#dFollow', 'onchange', e => { DB.update(id, { nextFollowUp: e.target.value || null }); onChange(); toast('Напоминание сохранено'); });
  on('#dNotes', 'onblur', e => { if (e.target.value !== (DB.get(id)?.notes || '')) { DB.update(id, { notes: e.target.value }); onChange(); toast('Заметка сохранена'); } });
  on('#dMsg', 'onblur', e => { if (e.target.value !== (DB.get(id)?.draft || '')) DB.update(id, { draft: e.target.value }); });
  on('#dGen', 'onclick', async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Пишу…';
    const cur = DB.get(id); const r = await writeMessage(cur, $('#dCh').value, { followup: (cur.touches || 0) > 0, lang: $('#dLang').value });
    $('#dMsg').value = r.text; DB.update(id, { draft: r.text });
    $('#dSrc').textContent = r.source === 'ai' ? 'Написано ИИ' : `Шаблон (ИИ недоступен: ${r.error})`;
    btn.disabled = false; btn.textContent = 'Написать заново';
  });
  on('#dCopy', 'onclick', async () => toast(await copyText($('#dMsg').value) ? 'Скопировано' : 'Не удалось скопировать'));
  on('#dCall', 'onclick', () => { DB.log(id, 'call', 'Звонок'); const c = DB.get(id); DB.update(id, { touches: (c.touches || 0) + 1, lastContact: new Date().toISOString(), ...(c.owner ? {} : { owner: Auth.user.id, ownerName: Auth.user.name }) }); setTimeout(refresh, 300); });
  on('#dSend', 'onclick', async () => {
    const text = $('#dMsg').value.trim(); if (!text) { toast('Сначала напишите сообщение', 'error'); $('#dMsg').focus(); return; }
    const ch = $('#dCh').value; if (!ch) { toast('Нет контактов для отправки', 'error'); return; }
    if (ownedByOther(DB.get(id)) && !confirm(`Этого лида ведёт ${DB.get(id).ownerName}. Всё равно отправить?`)) return;
    if (await sendVia(DB.get(id), ch, text)) { toast(`Отмечено как отправлено, напомню через ${Settings.get().followupDays} дн.`); refresh(); }
  });
  on('#dDel', 'onclick', () => { if (confirm(`Удалить лида «${l.name}»? Это действие нельзя отменить.`)) { DB.remove(id); closeDrawer(); onChange(); toast('Лид удалён'); } });
}

/* ---------- Запуск страницы: проверка входа → загрузка данных → скрипт страницы ---------- */
const VER = '26';
async function boot() {
  const body = document.body; const need = body.dataset.auth || 'member'; const page = body.dataset.page;
  let cached = null;
  try {
    if (Cloud.configured && !window.supabase) throw new Error('Не удалось загрузить модуль облака. Проверьте интернет и обновите страницу.');
    Cloud.init();
    cached = LS.get('lf_nav_user', null);
    if (cached && need !== 'guest') renderNav(cached);
    await Auth.init();
    LS.set('lf_nav_user', Auth.user ? { id: Auth.user.id, name: Auth.user.name, role: Auth.user.role } : null);
    if (need === 'guest' && Auth.user) { location.replace(new URLSearchParams(location.search).get('next') || 'home.html'); return; }
    if ((need === 'member' || need === 'admin') && !Auth.user) { location.replace('index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return; }
    if (need === 'admin' && Auth.user.role !== 'admin') { location.replace('home.html'); return; }
    if (Cloud.on) {
      await Cloud.loadConfig(Auth.user ? ['site', 'team'] : ['site']);
      if (Auth.user && need !== 'guest') { await Cloud.loadLeads(); Cloud.subscribe(); }
    }
  } catch (e) {
    body.classList.add('ready');
    body.innerHTML = `<main class="wrap page"><div class="card empty"><h3>Не удалось подключиться</h3><p>${esc(e.message)}</p><button class="btn" id="reload">Обновить страницу</button></div></main>`; $('#reload').onclick = () => location.reload(); return;
  }
  if (need !== 'guest') { const c2 = LS.get('lf_nav_user', null); if (!$('body > header.topbar') || !Auth.user || !cached || cached.name !== c2?.name || cached.role !== c2?.role) renderNav(); else refreshBadge(); }
  if (need === 'public') renderFooter();
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]);
  body.classList.add('ready'); setTimeout(() => { body.classList.add('settled'); document.documentElement.classList.add('smooth'); }, 1200);
  if (page) { const s = document.createElement('script'); s.src = `assets/${page}.js?v=${VER}`; s.onload = () => requestAnimationFrame(updateSegs); body.append(s); }
}
// непредвиденные ошибки в работе — показываем коротко, не чаще раза в 5 секунд
let lastErrAt = 0;
const reportError = err => { console.error(err); if (!document.body?.classList.contains('ready') || Date.now() - lastErrAt < 5000) return; lastErrAt = Date.now(); toast('Что-то пошло не так: ' + String(err?.message || err).slice(0, 120) + '. Обновите страницу, если кнопка не сработала.', 'error'); };
window.addEventListener('error', e => { if (e.error) reportError(e.error); });
window.addEventListener('unhandledrejection', e => reportError(e.reason));
// любая непредвиденная ошибка при запуске — понятное сообщение вместо пустой страницы
document.addEventListener('DOMContentLoaded', () => boot().catch(e => {
  console.error(e); document.body.classList.add('ready');
  const m = $('main') || document.body; m.innerHTML = `<div class="card empty" style="margin:40px auto;max-width:520px"><h3>Страница не загрузилась</h3><p>${esc(e.message)}</p><button class="btn" id="reload2">Обновить</button></div>`;
  $('#reload2').onclick = () => location.reload();
}));
