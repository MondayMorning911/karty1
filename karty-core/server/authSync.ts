const PYTHON_API = 'http://127.0.0.1:8000';

const SITE_MAP: Record<string, string> = {
  ssge: 'ss_ge',
  myhome: 'myhome_ge',
  korter: 'korter_ge',
};

export async function syncAuthStateToPython(userId: string, platform: string, state: any) {
  const site = SITE_MAP[platform] || platform;
  const response = await fetch(`${PYTHON_API}/api/storage-state/${encodeURIComponent(userId)}/${site}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    throw new Error(`Python auth state sync failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
