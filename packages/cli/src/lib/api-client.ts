import { API_BASE_URL } from './constants';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type FetchOptions = Omit<RequestInit, 'body'> & {
  token?: string;
  body?: unknown;
};

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, body, headers, ...rest } = opts;

  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = resp.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await resp.json().catch(() => null)
    : await resp.text();

  if (!resp.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'http_error';
    throw new ApiError(resp.status, code, code);
  }

  return payload as T;
}
