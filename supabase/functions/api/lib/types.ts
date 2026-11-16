export type Session = { type: 'ACCOUNT' | 'GUEST'; role: string; name: string; account_id?: string; username?: string; person_id?: string };
export type ApiResult = { success: boolean; data: unknown; message: string; code: string };
// deno-lint-ignore no-explicit-any
export type RouteFn = (s: Session | null, a: Record<string, any>, token: string) => Promise<unknown>;
