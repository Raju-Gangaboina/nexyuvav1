// Thin fetch wrapper for talking to the standalone NexYuva backend (../backend).
// Configure the URL via NEXT_PUBLIC_API_URL in .env.local; defaults to local dev server.

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Attach the real backend's JWT (if the user is logged in) so this Node service can
  // identify who's calling -- previously every request here was anonymous, which is why
  // job postings had no real owner and any company could see/post as any other.
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexyuva_real_token') : null;
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API request failed: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
