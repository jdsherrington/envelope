import type { ProviderAdapter, ProviderId } from "./types";

export class ProviderRegistry {
  private adapters = new Map<ProviderId, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.providerId)) {
      throw new Error(`Provider already registered: ${adapter.providerId}`);
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  registerMany(adapters: ProviderAdapter[]): void {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  get(providerId: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return adapter;
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }
}
