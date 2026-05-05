import type { ApiErrorCode } from '@shizuku/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode | string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Build from a fetch Response. Returns a generic 500 if body isn't valid JSON. */
  static async fromResponse(res: Response): Promise<ApiError> {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return new ApiError(res.status, 'internal', `HTTP ${res.status}`);
    }
    const env =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { error: { code: string; message: string; details?: unknown } }).error
        : null;
    return new ApiError(
      res.status,
      env?.code ?? 'internal',
      env?.message ?? `HTTP ${res.status}`,
      env?.details,
    );
  }

  is(code: ApiErrorCode | string): boolean {
    return this.code === code;
  }
}
