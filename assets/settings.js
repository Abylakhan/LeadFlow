/* Личный профиль сотрудника */
{
  const me = Auth.user; const p = Settings.personal();
  $('#who').textContent = `${me.name} · ${me.email} · ${me.role === 'admin' ? 'главный администратор' : 'сотрудник'}`;
  $('#pCity').value = p.city || ''; $('#pCity').placeholder = 'по умолчанию — ' + Team.get().city; $('#pTone').value = p.tone; $('#pLang').value = p.lang || 'ru';
  $('#pSave').onclick = () => { Settings.setPersonal({ city: $('#pCity').value.trim(), tone: $('#pTone').value, lang: $('#pLang').value }); toast('Сохранено'); };

  $('#pwForm').onsubmit = async e => {
    e.preventDefault(); const n = $('#pwNew').value;
    if (n.length < 8 || !/\d/.test(n) || !/[a-zа-я]/i.test(n)) { toast('Новый пароль: минимум 8 символов, буквы и цифры', 'error'); return; }
    if (n !== $('#pwNew2').value) { toast('Новые пароли не совпадают', 'error'); $('#pwNew2').focus(); return; }
    const b = $('#pwBtn'); b.disabled = true;
    try { await Auth.changePassword($('#pwOld').value, n); e.target.reset(); toast('Пароль изменён'); }
    catch (x) { toast(x.message, 'error'); }
    finally { b.disabled = false; }
  };

  const mine = DB.all().filter(isMine);
  $('#dataInfo').textContent = `Вы ведёте ${mine.length} лидов, всего в базе команды ${DB.all().length}.`;
  $('#expMine').onclick = () => mine.length ? download(`my-leads-${today()}.csv`, leadsToCSV(mine), 'text/csv;charset=utf-8') : toast('У вас пока нет своих лидов', 'error');
  if (me.role === 'admin') $('#expAll').onclick = () => download(`leads-${today()}.csv`, leadsToCSV(DB.all()), 'text/csv;charset=utf-8'); else $('#expAll').remove();
}
