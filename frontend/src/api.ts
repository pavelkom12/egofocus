import { Platform } from 'react-native';
import type { Metric, Transition } from './domain';
export type Profile = {
  id: string;
  username: string;
  birthday: string;
  bornAt: number;
  email: string;
  metric: Metric;
  revision: number;
};
export type AuthResult = { profile: Profile; token: string };
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  token?: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const base =
    process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === 'web' ? 'http://localhost:8082/v1' : '');
  if (!base)
    throw new ApiError(
      0,
      'Для iPhone задайте адрес сервера EXPO_PUBLIC_API_URL.',
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(base.replace(/\/$/, '') + path, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        result.error || 'Ошибка запроса к серверу.',
      );
    }
    return response.status === 204 ? (undefined as T) : await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Сервер недоступен. Проверьте подключение к сети.');
  } finally {
    clearTimeout(timeout);
  }
}
export async function snapshot(token: string) {
  for (let i = 0; i < 3; i++) {
    const [profile, history] = await Promise.all([
      api<Profile>('/profile', token),
      api<{ revision: number; transitions: Transition[] }>('/timeline', token),
    ]);
    if (profile.revision === history.revision)
      return { profile, transitions: history.transitions };
  }
  throw new ApiError(409, 'История обновляется. Повторите синхронизацию.');
}
