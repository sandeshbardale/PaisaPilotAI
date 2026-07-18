import type { AuthResponse, ChatMessage, DashboardData, Transaction, TransactionPage, User } from './types';

export const API_BASE = 'http://127.0.0.1:8000';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('access_token');
}

export function setToken(token: string): void {
  localStorage.setItem('access_token', token);
}

export function removeToken(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('pp_user');
}

export function getSavedUser(): User | null {
  try {
    const raw = localStorage.getItem('pp_user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: User): void {
  localStorage.setItem('pp_user', JSON.stringify(user));
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type for JSON bodies (not FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));

  if (!res.ok) {
    const msg =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: { msg: string }) => e.msg).join('; ')
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, name: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    }, true),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, true),

  me: () => request<User>('/auth/me'),

  updateProfile: (name: string) =>
    request<User>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<{ message: string }>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    }),

  updateTheme: (dark_mode: boolean) =>
    request<{ dark_mode: boolean }>('/auth/theme', {
      method: 'PATCH',
      body: JSON.stringify({ dark_mode }),
    }),

  deleteAccount: () =>
    request<void>('/auth/account', { method: 'DELETE' }),
};

// ─── Transactions API ─────────────────────────────────────────────────────────

export const txApi = {
  list: (params?: {
    search?: string;
    category?: string;
    transaction_type?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.transaction_type) qs.set('transaction_type', params.transaction_type);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    const q = qs.toString();
    return request<TransactionPage>(`/transactions${q ? `?${q}` : ''}`);
  },

  add: (data: {
    date: string;
    description: string;
    category: string;
    amount: number;
    transaction_type: string;
    notes?: string;
  }) =>
    request<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: number) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),
};

// ─── Dashboard API ────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: () => request<DashboardData>('/dashboard'),
};

// ─── Upload API ───────────────────────────────────────────────────────────────

export const uploadApi = {
  statement: (file: File, onProgress?: (pct: number) => void) => {
    return new Promise<{
      filename: string;
      file_size: number;
      status: string;
      transaction_count: number;
      message: string;
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/uploads/statement`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 90));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));

      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },
};

// ─── Chat API ─────────────────────────────────────────────────────────────────

export const chatApi = {
  history: () => request<ChatMessage[]>('/chat/history'),
  ask: (question: string) =>
    request<{ answer: string; grounded_transaction_count: number }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
};
