/**
 * Lightweight session store — holds the currently authenticated user
 * fetched from GET /api/v1/auth/me. Safe to import anywhere; no circular deps.
 */
import { api } from '@/api/client';

export interface SessionUser {
  id: string;
  email: string | null;
  username: string | null;
  role: 'parent' | 'child' | 'admin';
  language: string;
  timezone: string;
  locale: string;
  date_format: 'locale' | 'dd-mm-yyyy' | 'dd_month_yyyy' | 'mm/dd/yyyy';
  time_format: '24h' | '12h';
  week_start: number;
}

let _user: SessionUser | null = null;

export const session = {
  get user(): SessionUser | null { return _user; },
  get isLoggedIn(): boolean { return _user !== null; },
  get role(): 'parent' | 'child' | 'admin' | undefined { return _user?.role; },

  /** Fetch current session from the backend. Call once on app boot. */
  async fetch(): Promise<SessionUser | null> {
    try {
      _user = await api.get<SessionUser>('/auth/me');
    } catch {
      _user = null;
    }
    return _user;
  },

  set(user: SessionUser): void { _user = user; },
  clear(): void { _user = null; },
};
