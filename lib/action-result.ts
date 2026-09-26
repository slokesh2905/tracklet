export type ActionResult<T = object> =
  | ({ ok: true; message?: string } & T)
  | { ok: false; error: string };

export const fail = (error: string) => ({ ok: false, error }) as const;
