// ============================================================
// V9: Connection Configuration & Types
// ============================================================

export type Protocol = 'bolt' | 'bolt+s' | 'neo4j' | 'neo4j+s' | 'http' | 'https';

export interface ConnectionConfig {
    protocol: Protocol;
    host: string;      // e.g., "localhost" or "db-id.databases.neo4j.io"
    port: string;      // e.g., "7687"
    username: string;
    password: string;
}

export interface RecentConnection {
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
};

// Protocols that are secure (TLS)
export const SECURE_PROTOCOLS: Protocol[] = ['bolt+s', 'neo4j+s', 'https'];

// Check if mixed content warning should be shown
export function shouldShowMixedContentWarning(protocol: Protocol): boolean {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    return isHttps && !SECURE_PROTOCOLS.includes(protocol);
}
