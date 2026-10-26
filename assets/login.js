/* Вход и регистрация сотрудников */
{
  const next = new URLSearchParams(location.search).get('next') || '';
  const go = () => location.replace(/^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : 'home.html');
  const show = which => morphHeight($('.auth-box'), () => {
    $('#loginForm').hidden = which !== 'login'; $('#regForm').hidden = which !== 'reg'; $('#pendingBox').hidden = which !== 'pending';
    $('.auth-tabs').hidden = which === 'pending';
    $('#tabLogin').classList.toggle('on', which === 'login'); $('#tabReg').classList.toggle('on', which === 'reg');
    $('#tabLogin').setAttribute('aria-selected', which === 'login'); $('#tabReg').setAttribute('aria-selected', which === 'reg');
    replay(which === 'login' ? $('#loginForm') : which === 'reg' ? $('#regForm') : $('#pendingBox'));
    const f = which === 'login' ? $('#lEmail') : which === 'reg' ? $('#rName') : null; f && setTimeout(() => f.focus({ preventScroll: true }), 50);
  });
  $('#tabLogin').onclick = () => show('login'); $('#tabReg').onclick = () => show('reg');
  $('#backToLogin').onclick = () => show('login');
  $$('.pw-eye').forEach(b => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Показать пароль' : 'Скрыть пароль'); });
  $('#modeNote').textContent = Cloud.on ? '' : 'Демо-режим: аккаунты хранятся только в этом браузере.';
  if (Auth.status) { $('#loginErr').textContent = STATUS_TEXT[Auth.status] || ''; }
  if (location.hash === '#register') show('reg'); else show('login');

  const busy = (btn, on, label) => { btn.disabled = on; btn.innerHTML = on ? '<span class="spin"></span> Подождите…' : label; };
  const fieldErr = (input, box, msg) => { box.textContent = msg; input.setAttribute('aria-invalid', 'true'); input.focus(); input.closest('.auth-box').classList.remove('shake'); void input.offsetWidth; input.closest('.auth-box').classList.add('shake'); };
  $$('input').forEach(i => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); }));

  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); const err = $('#loginErr'); err.textContent = '';
    const email = $('#lEmail').value, pass = $('#lPass').value;
    if (!validEmail(email)) return fieldErr($('#lEmail'), err, 'Введите email, например name@gmail.com');
    if (!pass) return fieldErr($('#lPass'), err, 'Введите пароль');
    busy($('#loginBtn'), true);
    try { await Auth.login(email, pass); go(); }
    catch (x) { busy($('#loginBtn'), false, 'Войти'); if (Auth.status) { err.textContent = x.message; return; } fieldErr($('#lPass'), err, x.message); $('#lPass').select(); }
  };

  const strong = p => p.length >= 8 && /[a-zа-я]/i.test(p) && /\d/.test(p);
  $('#rPass').addEventListener('input', e => { const ok = strong(e.target.value); $('#pwHint').classList.toggle('ok', ok); $('#pwHint').textContent = ok ? 'Надёжный пароль' : 'Минимум 8 символов, буквы и цифры'; });
  $('#regForm').onsubmit = async e => {
    e.preventDefault(); const err = $('#regErr'); err.textContent = '';
    const name = $('#rName').value.trim(), email = $('#rEmail').value, pass = $('#rPass').value;
    if (name.length < 2) return fieldErr($('#rName'), err, 'Укажите имя — так вас увидят коллеги');
    if (!validEmail(email)) return fieldErr($('#rEmail'), err, 'Введите email, например name@gmail.com');
    if (!strong(pass)) return fieldErr($('#rPass'), err, 'Пароль: минимум 8 символов, буквы и цифры');
    busy($('#regBtn'), true);
    try {
      const st = await Auth.register({ email, name, password: pass });
      if (st === 'active') return go();
      $('#lEmail').value = normEmail(email); show('pending');
    } catch (x) { busy($('#regBtn'), false, 'Зарегистрироваться'); fieldErr($('#rEmail'), err, x.message); }
  };
}
