export const customerServiceKeys = {
  all: ['customer-service'] as const,
  workspace: () => ['customer-service', 'workspace'] as const,
};
