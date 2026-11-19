import { afterEach, expect, it, vi } from 'vitest';
import { fetchOrganisationAccess } from './apiService';

afterEach(() => { vi.unstubAllGlobals(); });

it('gives a readable error, not the browser text, when the backend is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(fetchOrganisationAccess(async () => 'token')).rejects.toThrow('Could not verify organisation access. Check the backend and retry.');
});

it('treats a non-JSON reply as an invalid response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 })));
  await expect(fetchOrganisationAccess(async () => 'token')).rejects.toThrow('The organisation access response was invalid. Please retry.');
});
