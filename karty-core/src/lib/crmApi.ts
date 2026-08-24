const TOKEN_KEY = 'crm_token';

export function getCrmToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearCrmSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('crm_user');
}

export async function crmFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers || {});
  const token = getCrmToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearCrmSession();
    if (!window.location.pathname.startsWith('/crm')) {
      window.location.href = '/crm';
    } else {
      // Reload so Crm mounts without a token and shows the login screen.
      window.location.reload();
    }
  }
  return res;
}
