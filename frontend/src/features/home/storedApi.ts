/** GET from the backend's public stored-data routes (market prices, news), with the shared API key and a timeout. */
export async function getStored(path: string, failure: string): Promise<unknown> {
  const env = import.meta.env ?? {};
  const base = (env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {
      cache: 'no-store', signal: controller.signal,
      headers: { ...(env.VITE_API_KEY && { 'X-API-Key': env.VITE_API_KEY }) },
    });
    if (!response.ok) throw new Error(failure);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
