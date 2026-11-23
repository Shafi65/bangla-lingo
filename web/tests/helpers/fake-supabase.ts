// A tiny stand-in for the parts of a supabase-js client the app uses. Query builders record every
// call and resolve to whatever `respond` returns for the finished chain.
import { vi } from "vitest";

export type Call = [string, ...unknown[]];
export interface Chain {
  table: string;
  calls: Call[];
}

export function fakeSupabase(respond: (chain: Chain) => { data?: unknown; error?: unknown } = () => ({ data: null, error: null })) {
  const chains: Chain[] = [];
  const builder = (chain: Chain): unknown =>
    new Proxy(
      {},
      {
        get(_t, key) {
          if (key === "then") {
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null, ...respond(chain) }).then(res, rej);
          }
          return (...args: unknown[]) => {
            chain.calls.push([String(key), ...args]);
            return builder(chain);
          };
        },
      },
    );
  let authCb: ((event: string, session: unknown) => void) | null = null;
  const session = (id = "user-1", email = "learner@example.test") => ({ user: { id, email }, access_token: "t" });
  const client = {
    chains,
    from: vi.fn((table: string) => {
      const chain: Chain = { table, calls: [] };
      chains.push(chain);
      return builder(chain);
    }),
    rpc: vi.fn(async () => ({ data: null, error: null as unknown })),
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
      getSession: vi.fn(async () => ({ data: { session: null as unknown } })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null as unknown })),
      verifyOtp: vi.fn(async () => ({ data: { session: session() }, error: null as unknown })),
      exchangeCodeForSession: vi.fn(async () => ({ data: { session: session() }, error: null as unknown })),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null as unknown })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    emit(event: string, s: unknown) {
      authCb?.(event, s);
    },
    session,
  };
  return client;
}
