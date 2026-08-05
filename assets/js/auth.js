(() => {
  const form = document.getElementById('login-form');
  if (!form) return;

  const err = document.getElementById('login-error');
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  if (MamsApi.getToken()) {
    MamsApi.api('/auth/me').then((me) => {
      location.href = next || MamsApi.postLoginPath(me.user);
    }).catch(() => MamsApi.clearAuth());
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (err) err.hidden = true;
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

    const fd = new FormData(form);
    try {
      const data = await MamsApi.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: fd.get('email'),
          password: fd.get('password'),
        }),
      });
      MamsApi.setAuth({
        token: data.token,
        tenantSlug: data.tenantSlug,
        role: data.user?.role,
      });
      location.href = next || MamsApi.postLoginPath(data.user);
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = ex.message || 'Login failed';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  });

  MamsApi.api('/public/login-trust-logos').then((logos) => {
    const list = Array.isArray(logos) ? logos : logos?.items || [];
    if (!list.length) return;
    const wrap = document.getElementById('trust-logos');
    if (!wrap) return;
    wrap.innerHTML = list.slice(0, 8).map((l) =>
      `<img src="${l.logoUrl || l.url || ''}" alt="${l.name || ''}" loading="lazy" />`
    ).join('');
    wrap.hidden = false;
  }).catch(() => {});
})();
