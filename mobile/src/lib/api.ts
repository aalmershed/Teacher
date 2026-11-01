import * as SecureStore from 'expo-secure-store';

// رابط الخادم: الموقع المنشور افتراضيًا، ويمكن تغييره للتجربة بـ EXPO_PUBLIC_API_URL
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://mualimhub.com').replace(/\/$/, '');

const TOKEN_KEY = 'session-token';
let token: string | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// يُستدعى عند انتهاء الجلسة (401) ليرجع المستخدم لشاشة الدخول
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Client': 'mobile', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: payload, credentials: 'omit' });
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم. تأكد من الإنترنت.', 0);
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* استجابة غير JSON */ }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(data?.error || 'تعذر الاتصال بالخادم', res.status, data?.code);
  }
  return data as T;
}

export type Subscription = { active: boolean; status: string; plan: string | null; endsAt: number | null };
export type User = { id: number; name: string; email: string; phone: string | null; isAdmin: boolean; subscription: Subscription };
export type DocSummary = { id: number; title: string; updated_at: string };
