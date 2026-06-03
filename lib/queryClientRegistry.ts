import type { QueryClient } from '@tanstack/react-query';

let registeredClient: QueryClient | null = null;

export function registerQueryClient(client: QueryClient): void {
    registeredClient = client;
}

export function getRegisteredQueryClient(): QueryClient | null {
    return registeredClient;
}
