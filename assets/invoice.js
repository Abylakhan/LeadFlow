/* Счёт для клиента: данные берутся из ссылки, реквизиты — из настроек сайта */
{
  const box = $('#inv'); const s = Site.get(); const c = s.contacts || {};
  let d = null;
  try {
    const raw = location.hash.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw), ch => ch.charCodeAt(0))));
    if (d.v !== 1 || typeof d.c !== 'string' || !(+d.t > 0)) throw new Error();
  } catch { d = null; }
  if (!d) {
    box.innerHTML = '<div class="empty"><h3>Счёт не найден</h3><p>Ссылка повреждена или неполная. Попросите менеджера прислать её ещё раз.</p></div>';
  } else {
    const total = Math.round(+d.t), paid = Math.max(0, Math.round(+d.pd || 0)), prepay = Math.min(100, Math.max(0, +d.p || 0));
    const prepaySum = Math.round(total * prepay / 100), due = Math.max(0, (paid ? total : prepaySum) - paid);
    const wa = digits(c.whatsapp);
    const confirmText = `Здравствуйте! Оплатил(а) счёт ${String(d.no).slice(0, 20)} на сумму ${money(paid ? due : prepaySum).replace(/ /g, ' ')}. Отправляю чек.`;
    const pays = (s.payments || []).filter(p => !d.co || !p.country || p.country === d.co);
    const list = pays.length ? pays : (s.payments || []);
    box.innerHTML = `<div class="inv-head"><div><span class="eyebrow">Счёт ${esc(String(d.no).slice(0, 20))}</span><h1>${esc(s.brand?.name || '')}</h1><p class="muted" style="margin:0">${esc(s.brand?.title || '')}</p></div>
        <div class="inv-date small muted">от ${esc(new Date(d.d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
      <dl class="kv inv-kv"><dt>Клиент</dt><dd>${esc(d.c.slice(0, 120))}</dd><dt>Услуга</dt><dd>${esc(String(d.s).slice(0, 120))}</dd>${d.m ? `<dt>Менеджер</dt><dd>${esc(String(d.m).slice(0, 60))}</dd>` : ''}</dl>
      <div class="inv-sum">
        <div><span class="muted small">Стоимость</span><b>${money(total)}</b></div>
        ${paid ? `<div><span class="muted small">Уже оплачено</span><b>${money(paid)}</b></div>` : prepay < 100 ? `<div><span class="muted small">Предоплата ${prepay}%</span><b>${money(prepaySum)}</b></div>` : ''}
        <div class="due"><span class="small">К оплате сейчас</span><b>${money(due)}</b></div>
      </div>
      ${due ? `<h2 style="font-size:20px;margin:24px 0 10px">Способы оплаты</h2><div class="pay-grid">${list.map((p, i) => `<article class="card pay-card" style="--i:${i}"><h3 style="margin:0">${esc(p.name)}</h3><p class="small muted" style="margin:0">${esc(p.note || '')}</p>
          ${p.details ? `<div class="pay-num"><code>${esc(p.details)}</code><button type="button" class="btn copy" data-v="${esc(p.details)}">Скопировать</button></div>` : `<span class="small muted">Реквизиты пришлёт менеджер в WhatsApp</span>`}
          ${p.holder ? `<div class="small">Получатель: <b>${esc(p.holder)}</b></div>` : ''}
          ${safeUrl(p.link) ? `<a class="btn primary" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">Оплатить онлайн</a>` : ''}</article>`).join('')}</div>
        <div class="row gap wrap-row" style="margin-top:20px">${wa ? `<a class="btn primary big shine" href="https://wa.me/${wa}?text=${encodeURIComponent(confirmText)}" target="_blank" rel="noopener">Я оплатил(а) — отправить чек</a>` : ''}<button type="button" class="btn big" id="print">Сохранить PDF</button></div>`
      : '<div class="notice ok" style="margin-top:20px">Счёт оплачен полностью. Спасибо!</div>'}
      <p class="small muted" style="margin-top:20px">${esc(s.payTerms?.note || '')} Оплачивайте только по реквизитам на этой странице или из официального WhatsApp ${esc(c.whatsapp || '')}.</p>`;
    $$('.copy', box).forEach(btn => btn.onclick = async () => { if (await copyText(btn.dataset.v)) { btn.textContent = 'Скопировано ✓'; btn.classList.remove('lit'); void btn.offsetWidth; btn.classList.add('lit'); setTimeout(() => btn.textContent = 'Скопировать', 1800); } });
    $('#print') && ($('#print').onclick = () => print());
    document.title = `Счёт ${String(d.no).slice(0, 20)} — ${s.brand?.name || ''}`;
  }
}
