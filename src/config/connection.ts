// ============================================================
// V9: Connection Configuration & Types
// ============================================================

export type Protocol = 'bolt' | 'bolt+s' | 'neo4j' | 'neo4j+s' | 'http' | 'https' | 'redis' | 'rediss';
export type Provider = 'neo4j' | 'falkordb';

export interface ConnectionConfig {
    provider: Provider;  // V26: Database provider
    protocol: Protocol;
    host: string;      // e.g., "localhost" or "db-id.databases.neo4j.io"
    port: string;      // e.g., "7687" or "6379"
    username: string;
    password: string;
    database?: string; // Neo4j database name or FalkorDB graph key
}

export interface RecentConnection {
    provider: Provider;
    protocol: Protocol;
    host: string;
    port: string;
    username: string;
    // Note: Passwords are NOT stored in recent connections for security
}

// Default port for each protocol
export const DEFAULT_PORTS: Record<Protocol, string> = {
    'bolt': '7687',
    'bolt+s': '7687',
    'neo4j': '7687',
    'neo4j+s': '7687',
    'http': '7474',
    'https': '7473',
    'redis': '3000',   // FalkorDB Browser API
    'rediss': '3000',  // FalkorDB Browser API (TLS)
};

// Protocols available for each provider
export const PROVIDER_PROTOCOLS: Record<Provider, Protocol[]> = {
    neo4j: ['bolt', 'bolt+s', 'neo4j', 'neo4j+s', 'http', 'https'],
    falkordb: ['http', 'https', 'redis', 'rediss'],
};

// Helper: Get default port based on provider + protocol
export function getDefaultPort(provider: Provider, protocol: Protocol): string {
    if (provider === 'falkordb' && (protocol === 'http' || protocol === 'https')) {
        return '3000';
    }
    return DEFAULT_PORTS[protocol] || '7687';
}

// Protocols that are secure (TLS)
export const SECURE_PROTOCOLS: Protocol[] = ['bolt+s', 'neo4j+s', 'https', 'rediss'];

// Check if mixed content warning should be shown
export function shouldShowMixedContentWarning(protocol: Protocol): boolean {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    return isHttps && !SECURE_PROTOCOLS.includes(protocol);
}
