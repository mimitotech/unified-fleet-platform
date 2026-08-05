(() => {
  const form = document.getElementById('login-form');
  if (!form) return;
  const err = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
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
      location.href = MamsApi.postLoginPath(data.user);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message || 'Login failed';
    }
  });
})();
