/**
 * Qis Auth Client
 * Handles authentication state, token storage, and API auth headers.
 */

const TOKEN_KEY = 'qis_access_token';
const REFRESH_TOKEN_KEY = 'qis_refresh_token';
const USER_KEY = 'qis_user';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface ApiAuthResponse {
  data?: AuthTokens;
  message?: string | string[];
  detail?: string | string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// ============================================================
// Token helpers
// ============================================================
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function storeAuth(auth: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, auth.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ============================================================
// API auth endpoints
// ============================================================

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const json = (await res.json()) as ApiAuthResponse;
  if (!res.ok) {
    const message = json.message || json.detail || 'Login failed';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  const auth = json.data!;
  storeAuth(auth);
  return auth;
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  const json = (await res.json()) as ApiAuthResponse;
  if (!res.ok) {
    const message = json.message || json.detail || 'Registration failed';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  const auth = json.data!;
  storeAuth(auth);
  return auth;
}

export async function refreshTokens(): Promise<AuthTokens | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const json = (await res.json()) as ApiAuthResponse;
    if (!res.ok || !json.data) return null;

    const auth = json.data;
    storeAuth(auth);
    return auth;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  clearAuth();

  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore network errors on logout
    }
  }
}

// ============================================================
// Auth header helper
// ============================================================
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}