/* Цены для сотрудников: коротко, с кнопками «скопировать для клиента» */
{
  const s = Site.get(); const plain = n => money(n).replace(/ /g, ' ');
  const pub = location.href.replace(/[^/]*$/, '') + 'services.html';
  const priceText = p => p.max ? `${plain(p.price).replace(' ₸', '')}–${plain(p.max)}` : `от ${plain(p.price)}`;
  $('#pNote').textContent = s.brand?.priceNote || 'Цены «от» — точная сумма зависит от объёма.';
  const terms = s.payTerms || {};
  $('#info').innerHTML = [
    [`${terms.prepay ?? 50}% / ${100 - (terms.prepay ?? 50)}%`, 'предоплата / после запуска'],
    [`от ${plain(Math.min(...(s.packs || [{ price: 0 }]).map(p => +p.price || 0)))}`, 'самый дешёвый пакет'],
    ['14 дней', 'бесплатных правок'],
    [s.contacts?.whatsapp || '—', 'WhatsApp для клиентов'],
  ].map(([b, t], i) => `<div class="stat" style="--i:${i}"><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join('');
  const line = (name, price, note, copy) => `<div class="pline"><div class="grow"><b>${esc(name)}</b>${note ? `<div class="small muted">${esc(note)}</div>` : ''}</div><span class="pprice">${esc(price)}</span><button type="button" class="icon-btn" data-copy="${esc(copy)}" aria-label="Скопировать: ${esc(name)}" title="Скопировать для клиента">⧉</button></div>`;
  $('#packs').innerHTML = (s.packs || []).map(p => line(p.name, priceText(p), [p.days && `Срок ${p.days}`, p.note].filter(Boolean).join(' · '), `${p.name} — ${priceText(p)}${p.days ? `, срок ${p.days}` : ''}. ${p.note || ''}`.trim())).join('');
  $('#addons').innerHTML = (s.addons || []).map(a => { const pr = `+ ${plain(a.price)}${/мес/i.test(a.unit || '') ? ' / мес' : ''}`; return line(a.name, pr, a.note, `${a.name} — ${pr}. ${a.note || ''}`.trim()); }).join('');
  $('#promo').innerHTML = (s.promo || []).map(p => { const pr = `${plain(p.price)}${p.unit ? ' / ' + p.unit : ''}`; return line(p.name, pr, p.note, `${p.name} — ${pr}. ${p.note || ''}`.trim()); }).join('');
  const payLines = (s.payments || []).map(p => line(`${p.name}${p.country ? ' · ' + p.country : ''}`, p.details || 'реквизиты не указаны', [p.holder && 'Получатель: ' + p.holder, p.note].filter(Boolean).join(' · '), [p.name, p.details, p.holder && 'Получатель: ' + p.holder].filter(Boolean).join('\n'))).join('');
  $('#pay').innerHTML = `<ol class="small" style="margin:0 0 12px;padding-left:18px;line-height:1.8">${(terms.steps || []).map(t => `<li>${esc(t)}</li>`).join('')}</ol>${payLines}<p class="small muted" style="margin:10px 0 0">Счёт клиенту выставляется в карточке лида кнопкой «Счёт клиенту». Оплату отмечает администратор.</p>`;
  $('#demos').innerHTML = (s.demos || []).map(d => line(d.name, '', d.desc, `${d.name}: ${safeUrl(d.url) || pub}`)).join('') + line('Все цены и калькулятор', '', 'Страница для клиента', pub);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    if (await copyText(b.dataset.copy)) { b.textContent = '✓'; b.classList.remove('lit'); void b.offsetWidth; b.classList.add('lit'); setTimeout(() => { b.textContent = '⧉'; }, 1400); toast('Скопировано — вставьте в сообщение клиенту'); }
  });
  $('#copyLink').onclick = async () => toast(await copyText(pub) ? 'Ссылка на цены скопирована' : pub);
}
