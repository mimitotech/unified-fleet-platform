(() => {
  const loginForm = document.getElementById('login-form');
  const forgotForm = document.getElementById('forgot-form');
  const resetForm = document.getElementById('reset-form');
  const subtitle = document.getElementById('login-subtitle');
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  function showView(view) {
    loginForm.hidden = view !== 'login';
    forgotForm.hidden = view !== 'forgot';
    resetForm.hidden = view !== 'reset';
    if (subtitle) {
      subtitle.textContent =
        view === 'login' ? 'Mimito Asset Management System'
          : view === 'forgot' ? 'Reset your password'
            : 'Choose a new password';
    }
  }

  function showErr(el, msg) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  if (MamsApi.getToken()) {
    MamsApi.api('/auth/me').then((me) => {
      location.href = next || MamsApi.postLoginPath(me.user);
    }).catch(() => MamsApi.clearAuth());
  }

  document.getElementById('forgot-open')?.addEventListener('click', () => showView('forgot'));
  document.getElementById('forgot-back')?.addEventListener('click', () => showView('login'));
  document.getElementById('reset-back')?.addEventListener('click', () => showView('login'));

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    showErr(err, '');
    const btn = loginForm.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing In…'; }
    const fd = new FormData(loginForm);
    try {
      const data = await MamsApi.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      MamsApi.setAuth({ token: data.token, tenantSlug: data.tenantSlug, role: data.user?.role });
      location.href = next || MamsApi.postLoginPath(data.user);
    } catch (ex) {
      showErr(err, ex.message || 'Sign in failed');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  });

  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('forgot-error');
    showErr(err, '');
    const btn = forgotForm.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    const email = new FormData(forgotForm).get('email');
    try {
      const data = await MamsApi.api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (!data.resetToken) {
        showErr(err, data.message || 'If the account exists, check your email.');
        return;
      }
      document.getElementById('reset-token').value = data.resetToken;
      document.getElementById('reset-email-label').textContent = email;
      resetForm.querySelector('[name=newPassword]').value = '';
      resetForm.querySelector('[name=confirmPassword]').value = '';
      showView('reset');
    } catch (ex) {
      showErr(err, ex.message || 'Reset unavailable');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
    }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('reset-error');
    showErr(err, '');
    const fd = new FormData(resetForm);
    if (fd.get('newPassword') !== fd.get('confirmPassword')) {
      showErr(err, 'Passwords do not match');
      return;
    }
    const btn = resetForm.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await MamsApi.api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: fd.get('token'), newPassword: fd.get('newPassword') }),
      });
      showView('login');
      showErr(document.getElementById('login-error'), '');
      const ok = document.getElementById('login-error');
      if (ok) { ok.className = 'success-text'; ok.hidden = false; ok.textContent = 'Password updated. Sign in with your new password.'; }
    } catch (ex) {
      showErr(err, ex.message || 'Could not reset password');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save new password'; }
    }
  });

  /* Slides */
  const slidesEl = document.getElementById('login-slides');
  const dotsEl = document.getElementById('login-dots');
  let slideIdx = 0;
  let slides = [];

  const DEFAULT_SLIDES = [
    { id: 'default-1', src: '/assets/img/gps.jpg' },
    { id: 'default-2', src: '/assets/img/gp.png' },
    { id: 'default-3', src: '/assets/img/gp1.png' },
  ];

  function renderSlides(list) {
    slides = list.length ? list : DEFAULT_SLIDES;
    slidesEl.innerHTML = slides.map((s, i) =>
      `<div class="login-slide${i === 0 ? ' is-active' : ''}"><img src="${s.src}" alt="" draggable="false" /></div>`
    ).join('');
    if (slides.length > 1) {
      dotsEl.hidden = false;
      dotsEl.innerHTML = slides.map((s, i) =>
        `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
      ).join('');
      dotsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goSlide(+b.dataset.i)));
      setInterval(() => goSlide((slideIdx + 1) % slides.length), 6500);
    }
  }

  function goSlide(i) {
    slideIdx = i;
    slidesEl.querySelectorAll('.login-slide').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
    dotsEl.querySelectorAll('button').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
  }

  MamsApi.api('/public/login-slides').then((data) => {
    const rows = (data.slides || data || []).filter((s) => s.imageUrl || s.src);
    renderSlides(rows.map((s) => ({ id: s.id, src: s.imageUrl || s.src })));
  }).catch(() => renderSlides([]));

  MamsApi.api('/public/login-trust-logos').then((data) => {
    const list = (data.logos || data || []).filter((l) => l.imageUrl || l.logoUrl);
    if (!list.length) return;
    const wrap = document.getElementById('trust-logos');
    const track = document.getElementById('trust-logos-track');
    if (!wrap || !track) return;
    const base = list.length < 4 ? [...list, ...list, ...list] : list;
    const marqueeLogos = [...base, ...base];
    track.innerHTML = marqueeLogos.map((l) => {
      const name = l.name || '';
      const src = l.imageUrl || l.logoUrl;
      return `<div class="login-trust-logo" title="${name.replace(/"/g, '&quot;')}"><img src="${src}" alt="${name}" loading="lazy" draggable="false" /></div>`;
    }).join('');
    wrap.hidden = false;
  }).catch(() => {});
})();
