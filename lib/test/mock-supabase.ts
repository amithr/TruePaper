import { vi } from "vitest";

export type MockRpcResult = { data: unknown; error: { message: string; code?: string } | null };

export function createMockSupabase(handlers: {
  rpc?: (name: string, args: Record<string, unknown>) => MockRpcResult;
  from?: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<MockRpcResult>;
      };
    };
  };
}) {
  return {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      if (handlers.rpc) {
        return Promise.resolve(handlers.rpc(name, args));
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn((table: string) => {
      if (handlers.from) {
        return handlers.from(table);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    }),
  };
}
