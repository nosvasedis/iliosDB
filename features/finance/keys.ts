/** One root key: finance data is never persisted to localStorage and is dropped in inspection mode. */
export const financeKeys = {
  all: ['finance'] as const,
  workspace: () => ['finance', 'workspace'] as const,
};
