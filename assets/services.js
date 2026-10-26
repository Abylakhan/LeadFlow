/* Публичная страница: первый экран, калькулятор цены, оплата, примеры и контакты */
{
  const s = Site.get(), b = s.brand || {}, c = s.contacts || {};
  const links = contactLinks(); const wa = digits(c.whatsapp);
  const waLink = text => wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : '#contact';
  const plain = n => money(n).replace(/ /g, ' ');
  const packs = s.packs || [], addons = s.addons || [];
  document.title = `${b.title || 'Цены'} — ${b.name || ''}`;

  // заголовки появляются по словам
  const words = (el, text) => { el.innerHTML = String(text || '').split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' '); };
  words($('#title'), b.title || 'Сайты для бизнеса');
  $$('h2.words').forEach(h => words(h, h.dataset.text));
  $('#area').textContent = b.area || ''; $('#tagline').textContent = b.tagline || '';
  $('#priceNote').textContent = b.priceNote || ''; $('#about').textContent = b.about || '';
  const from = packs.length ? Math.min(...packs.map(p => +p.price || Infinity)) : 0;
  $('#heroCta').innerHTML = `<a class="btn primary big shine" href="#prices">Рассчитать стоимость</a>${wa ? `<a class="btn big" href="${esc(waLink(c.waText || 'Здравствуйте!'))}" target="_blank" rel="noopener">Написать в WhatsApp</a>` : ''}`;
  $('#facts').innerHTML = [from && `Сайт от ${money(from)}`, 'Запуск от 3 дней', 'Оплата 50/50', 'Три языка'].filter(Boolean).map((f, i) => `<li style="--i:${i}">${esc(f)}</li>`).join('');
  // в макете браузера по очереди приходят заявки
  const toasts = ['Айгерим: консультация, завтра в 15:00', 'Данияр: расчёт стоимости сайта', 'Мадина: запись на пятницу, 11:00', 'Ерлан: доставка в Шымкент'];
  let ti = 0; const tEl = $('.sb-toast');
  if (!calm()) setInterval(() => { ti = (ti + 1) % toasts.length; tEl.classList.remove('again'); void tEl.offsetWidth; $('#sbToast').textContent = toasts[ti]; tEl.classList.add('again'); }, 5200);

  /* ---------- калькулятор ---------- */
  const state = { pack: 0, add: new Set() };
  const monthly = a => /мес/i.test(a.unit || '');
  const row = (type, name, i, title, note, price, checked) => `<label class="crow${checked ? ' on' : ''}">
    <input type="${type}" name="${name}" value="${i}" ${checked ? 'checked' : ''}>
    <span class="mark" aria-hidden="true"></span><span class="row-name">${esc(title)}</span><span class="dots" aria-hidden="true"></span><span class="row-price">${price}</span>
    <span class="row-note">${esc(note || '')}</span></label>`;
  $('#packs').innerHTML = packs.map((p, i) => row('radio', 'pack', i, p.name, [p.note, p.days && `Срок ${p.days}`].filter(Boolean).join('. '), p.max ? `${plain(p.price).replace(' ₸', '')}–${plain(p.max)}` : `от ${plain(p.price)}`, i === 0)).join('');
  $('#addons').innerHTML = addons.map((a, i) => row('checkbox', 'add', i, a.name, a.note, `+ ${plain(a.price)}${monthly(a) ? ' / мес' : ''}`, false)).join('');
  $('#niche').innerHTML += Object.values(CATS).map(x => `<option>${esc(x.label)}</option>`).join('');
  $$('.rows input').forEach(inp => inp.onchange = () => {
    if (inp.name === 'pack') state.pack = +inp.value; else inp.checked ? state.add.add(+inp.value) : state.add.delete(+inp.value);
    $$(`.rows input[name=${inp.name}]`).forEach(x => x.closest('.crow').classList.toggle('on', x.checked));
    const r = inp.closest('.crow'); r.classList.remove('lit'); void r.offsetWidth; r.classList.add('lit');
    update();
  });

  let shown = 0, raf = 0;
  function tween(el, to, fmt) {
    cancelAnimationFrame(raf);
    if (calm() || !shown) { shown = to; el.textContent = fmt(to); return; }
    const start = shown, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3); shown = Math.round((start + (to - start) * e) / 1000) * 1000; if (k === 1) shown = to; el.textContent = fmt(shown); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function update() {
    const p = packs[state.pack] || { name: '', price: 0 }; const chosen = [...state.add].sort((x, y) => x - y).map(i => addons[i]);
    const once = chosen.filter(a => !monthly(a)), mo = chosen.filter(monthly);
    const total = (+p.price || 0) + once.reduce((t, a) => t + (+a.price || 0), 0);
    const spread = p.max ? p.max - p.price : 0;
    const moSum = mo.reduce((t, a) => t + (+a.price || 0), 0);
    $('#sumWhat').textContent = chosen.length ? `${p.name} и ${chosen.length} ${chosen.length === 1 ? 'опция' : chosen.length < 5 ? 'опции' : 'опций'}` : p.name;
    tween($('#sumTotal'), total, v => spread ? `${plain(v).replace(' ₸', '')}–${plain(v + spread)}` : `от ${plain(v)}`);
    $('#sumMeta').textContent = [p.days && `Срок ${p.days}`, moSum && `+ ${plain(moSum)} в месяц`, `предоплата ${s.payTerms?.prepay ?? 50}%`].filter(Boolean).join(' · ');
    morphHeight($('#gets'), () => $('#gets').innerHTML = `<h3>${esc(p.name)}</h3><p class="muted small">${esc(p.note || '')}</p>
      <ul class="gets-list">${[p.days && `Срок: ${p.days}`, ...chosen.map(a => `${a.name}${monthly(a) ? ' (ежемесячно)' : ''}`), 'Дизайн под ваш бренд, адаптив под телефон', '14 дней бесплатных правок после запуска'].filter(Boolean).map((t, i) => `<li style="--i:${i}">${esc(t)}</li>`).join('')}</ul>
      <p class="small muted" style="margin:0">Оплата: ${s.payTerms?.prepay ?? 50}% до начала, остаток после запуска. <a href="#pay">Как оплатить →</a></p>`);
    const niche = $('#niche').value;
    const msg = `Здравствуйте! Хочу заказать: ${p.name} (${spread ? `${plain(total).replace(' ₸', '')}–${plain(total + spread)}` : `от ${plain(total)}`}).` +
      (chosen.length ? `\nДополнительно: ${chosen.map(a => a.name).join(', ')}.` : '') + (moSum ? `\nЕжемесячно: ${plain(moSum)}.` : '') + (niche ? `\nМой бизнес: ${niche}.` : '') + '\nПодскажите точную цену и сроки.';
    $('#sumSend').href = waLink(msg);
  }
  $('#niche').onchange = update;
  update();
  // панель итога «прилипает» снизу, пока калькулятор на экране
  const sumbar = $('#sumbar');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => sumbar.classList.toggle('stuck', e.intersectionRatio < 1), { threshold: [1], rootMargin: '0px 0px -1px 0px' }).observe(sumbar);
    // пока виден калькулятор, круглая кнопка WhatsApp прячется, чтобы не закрывать итог
    new IntersectionObserver(([e]) => document.body.classList.toggle('calc-on', e.isIntersecting)).observe($('#prices'));
  }

  /* ---------- продвижение и примеры ---------- */
  const card = (p, unit) => `<article class="card price-card"><h3 style="margin:0">${esc(p.name)}</h3>
    <div class="p">${p.max ? plain(p.price).replace(' ₸', '') + '–' + plain(p.max) : 'от ' + plain(p.price)}${unit ? ' / ' + esc(unit) : ''}</div>
    <p>${esc(p.note || '')}</p>
    <a class="btn" href="${esc(waLink(`Здравствуйте! Интересует «${p.name}». Расскажите подробнее`))}" target="_blank" rel="noopener">Обсудить в WhatsApp</a></article>`;
  $('#promoList').innerHTML = (s.promo || []).map(p => card(p, p.unit)).join('');
  $('#demos').innerHTML = (s.demos || []).map((d, i) => `<a class="card demo" href="${esc(safeUrl(d.url) || '#portfolio')}" target="_blank" rel="noopener"><div class="shot" style="--h:${(i * 47) % 360}"><span>${esc(d.name)}</span></div><h3 style="margin:0">${esc(d.name)}</h3><p class="small muted" style="margin:0">${esc(d.desc || '')}</p><span class="small more">Открыть пример →</span></a>`).join('');

  /* ---------- оплата ---------- */
  const terms = s.payTerms || {};
  $('#paySteps').innerHTML = (terms.steps || []).map((t, i) => `<li style="--i:${i}"><span class="n">${i + 1}</span>${esc(t)}</li>`).join('');
  $('#payNote').textContent = terms.note || '';
  const pays = s.payments || []; const countries = [...new Set(pays.map(p => p.country).filter(Boolean))];
  let payC = countries[0] || '';
  $('#payCountry').innerHTML = countries.map(x => `<button type="button" data-c="${esc(x)}" class="${x === payC ? 'on' : ''}">${esc(x)}</button>`).join('');
  $('#payCountry').hidden = countries.length < 2;
  function renderPays() {
    const list = pays.filter(p => !payC || p.country === payC);
    $('#payList').innerHTML = list.map((p, i) => `<article class="card pay-card" style="--i:${i}"><h3 style="margin:0">${esc(p.name)}</h3><p class="small muted" style="margin:0">${esc(p.note || '')}</p>
      ${p.details ? `<div class="pay-num"><code>${esc(p.details)}</code><button type="button" class="btn copy" data-v="${esc(p.details)}">Скопировать</button></div>` : `<a class="btn" href="${esc(waLink(`Здравствуйте! Пришлите, пожалуйста, реквизиты для оплаты (${p.name})`))}" target="_blank" rel="noopener">Запросить реквизиты</a>`}
      ${p.holder ? `<div class="small">Получатель: <b>${esc(p.holder)}</b></div>` : ''}
      ${safeUrl(p.link) ? `<a class="btn primary" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">Оплатить онлайн</a>` : ''}</article>`).join('') || '<p class="muted">Реквизиты уточняйте в WhatsApp.</p>';
    $$('#payList .copy').forEach(btn => btn.onclick = async () => { if (await copyText(btn.dataset.v)) { btn.textContent = 'Скопировано ✓'; btn.classList.remove('lit'); void btn.offsetWidth; btn.classList.add('lit'); setTimeout(() => btn.textContent = 'Скопировать', 1800); } });
    replay($('#payList'));
  }
  $$('#payCountry button').forEach(btn => btn.onclick = () => { payC = btn.dataset.c; $$('#payCountry button').forEach(x => x.classList.toggle('on', x === btn)); renderPays(); });
  renderPays();

  $('#contacts').innerHTML = links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span>${esc(l.value)}</a>`).join('');
  reveal($$('main .section'));
  requestAnimationFrame(updateSegs);
}
