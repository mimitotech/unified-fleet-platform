(() => {
  const loginForm = document.getElementById('login-form');
  const forgotForm = document.getElementById('forgot-form');
  const resetForm = document.getElementById('reset-form');
  const subtitle = document.getElementById('login-subtitle');
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  const SLIDES_CACHE_KEY = 'ufp_public_login_slides';
  const LOGOS_CACHE_KEY = 'ufp_public_login_trust_logos';

  function showView(view) {
    const map = { login: loginForm, forgot: forgotForm, reset: resetForm };
    Object.entries(map).forEach(([key, el]) => {
      if (!el) return;
      const on = key === view;
      el.hidden = !on;
      el.style.display = on ? '' : 'none';
    });
    if (subtitle) {
      subtitle.textContent =
        view === 'login' ? 'Mimito Asset Management System'
          : view === 'forgot' ? 'Reset your password'
            : 'Choose a new password';
    }
  }

  showView('login');

  function showErr(el, msg) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  /* Password visibility toggles */
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.password-field');
      const input = wrap?.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      wrap.querySelector('.icon-eye')?.toggleAttribute('hidden', show);
      wrap.querySelector('.icon-eye-off')?.toggleAttribute('hidden', !show);
    });
  });

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
      MamsApi.setAuth({
        token: data.token,
        tenantSlug: data.tenantSlug || null,
        role: data.user?.role,
      });
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
      const ok = document.getElementById('login-error');
      if (ok) { ok.className = 'success-text'; ok.hidden = false; ok.textContent = 'Password updated. Sign in with your new password.'; }
    } catch (ex) {
      showErr(err, ex.message || 'Could not reset password');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save new password'; }
    }
  });

  /* Slides + trust logos — mirrors React Login.tsx */
  const slidesEl = document.getElementById('login-slides');
  const dotsEl = document.getElementById('login-dots');
  let slideIdx = 0;
  let slides = [];
  let slideTimer = null;

  const DEFAULT_SLIDES = [
    { id: 'default-1', src: '/assets/img/gps.jpg', eyebrow: 'Real-time GPS', title: 'See every asset, live', caption: 'Track vehicles, generators, and equipment on one map.' },
    { id: 'default-2', src: '/assets/img/gp.png', eyebrow: 'Operations hub', title: 'One dashboard for the fleet', caption: 'Fuel, alerts, routes, and workshop — unified for your team.' },
    { id: 'default-3', src: '/assets/img/gp1.png', eyebrow: 'Fuel intelligence', title: 'Protect every litre', caption: 'Fills, consumption, and sudden drops with clear reporting.' },
  ];

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function normalizeMediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) {
      try { return new URL(url).pathname; } catch { return url; }
    }
    return url;
  }

  function mapSlideRow(s) {
    return {
      id: s.id,
      src: normalizeMediaUrl(s.imageUrl || s.src),
      eyebrow: s.eyebrow || '',
      title: s.title || '',
      caption: s.details || s.caption || '',
    };
  }

  function renderSlides(list) {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
    slides = (list.length ? list : DEFAULT_SLIDES).filter((s) => s.src);
    if (!slides.length) slides = DEFAULT_SLIDES;

    slidesEl.innerHTML = slides.map((s, i) => {
      const cap = (s.eyebrow || s.title || s.caption) ? `
        <div class="login-slide-caption">
          ${s.eyebrow ? `<div class="login-slide-eyebrow">${esc(s.eyebrow)}</div>` : ''}
          ${s.title ? `<div class="login-slide-title">${esc(s.title)}</div>` : ''}
          ${s.caption ? `<div class="login-slide-sub">${esc(s.caption)}</div>` : ''}
        </div>` : '';
      return `<div class="login-slide${i === 0 ? ' is-active' : ''}">
        <img src="${esc(s.src)}" alt="" draggable="false" onerror="this.onerror=null;this.src='/assets/img/gp1.png'" />
        ${cap}
      </div>`;
    }).join('');

    if (slides.length > 1) {
      dotsEl.hidden = false;
      dotsEl.innerHTML = slides.map((s, i) =>
        `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
      ).join('');
      dotsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goSlide(+b.dataset.i)));
      slideTimer = setInterval(() => goSlide((slideIdx + 1) % slides.length), 6500);
    } else {
      dotsEl.hidden = true;
      dotsEl.innerHTML = '';
    }
  }

  function goSlide(i) {
    slideIdx = i;
    slidesEl.querySelectorAll('.login-slide').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
    dotsEl.querySelectorAll('button').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function renderTrustLogos(list) {
    if (!list.length) return;
    const wrap = document.getElementById('trust-logos');
    const track = document.getElementById('trust-logos-track');
    if (!wrap || !track) return;
    const base = list.length < 4 ? [...list, ...list, ...list] : list;
    const marqueeLogos = [...base, ...base];
    track.innerHTML = marqueeLogos.map((l, idx) => {
      const name = l.name || '';
      const src = normalizeMediaUrl(l.imageUrl || l.logoUrl);
      return `<div class="login-trust-logo" title="${esc(name)}"><img src="${esc(src)}" alt="${esc(name)}" loading="lazy" draggable="false" onerror="this.style.display='none'" /></div>`;
    }).join('');
    wrap.hidden = false;
  }

  MamsApi.api('/public/login-slides').then((data) => {
    const rows = (data.slides || []).filter((s) => s.imageUrl).map(mapSlideRow);
    if (rows.length) {
      writeCache(SLIDES_CACHE_KEY, rows);
      renderSlides(rows);
    } else {
      try { localStorage.removeItem(SLIDES_CACHE_KEY); } catch { /* ignore */ }
      const cached = readCache(SLIDES_CACHE_KEY).filter((s) => s.src);
      renderSlides(cached.length ? cached : DEFAULT_SLIDES);
    }
  }).catch(() => {
    const cached = readCache(SLIDES_CACHE_KEY).filter((s) => s.src);
    renderSlides(cached.length ? cached : DEFAULT_SLIDES);
  });

  MamsApi.api('/public/login-trust-logos').then((data) => {
    const list = (data.logos || []).filter((l) => l.imageUrl).map((l) => ({
      id: l.id, name: l.name, imageUrl: normalizeMediaUrl(l.imageUrl),
    }));
    if (list.length) {
      writeCache(LOGOS_CACHE_KEY, list);
      renderTrustLogos(list);
    } else {
      try { localStorage.removeItem(LOGOS_CACHE_KEY); } catch { /* ignore */ }
      const cached = readCache(LOGOS_CACHE_KEY);
      if (cached.length) renderTrustLogos(cached);
    }
  }).catch(() => {
    const cached = readCache(LOGOS_CACHE_KEY);
    if (cached.length) renderTrustLogos(cached);
  });
})();
