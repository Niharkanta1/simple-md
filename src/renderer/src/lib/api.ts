import type { ApiMethodName, ApiMethods } from '../../../shared/api';
import type { Envelope, ErrorCode } from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type AsyncApi = {
  [K in keyof ApiMethods]: ApiMethods[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never;
};

/** Typed access to the main process. Throws ApiError on failure. */
export const api: AsyncApi = new Proxy({} as AsyncApi, {
  get(_target, method: string) {
    return async (...args: unknown[]) => {
      const env = (await window.api.invoke(method as ApiMethodName, ...args)) as Envelope<unknown>;
      if (env.ok) return env.data;
      throw new ApiError(env.error.code, env.error.message);
    };
  }
});

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
