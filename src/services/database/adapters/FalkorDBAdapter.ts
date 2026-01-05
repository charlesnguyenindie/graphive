/**
 * FalkorDB Adapter (V28: HTTP Hybrid)
 * Connects to FalkorDB via the FalkorDB Browser API port (default 3000).
 * This works natively in browsers by "hijacking" the Docker container's BFF.
 */

import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../../../store/useGraphStore';
import { ConnectionConfig, GraphDBAdapter, DashboardMeta, GraphResult, StandardRecord } from '../types';

export class FalkorDBAdapter implements GraphDBAdapter {
    readonly id = 'falkordb' as const;

    private accessToken: string | null = null;
    private baseUrl: string = '';
    private graphName = 'Graphive'; // Default graph key
    private currentConfig: ConnectionConfig | null = null;

    // --- Connection Management ---

    isInitialized(): boolean {
        return this.accessToken !== null;
    }

    initialize(config: ConnectionConfig): void {
        this.currentConfig = config;
        this.graphName = config.database || 'Graphive';

        // Construct Base URL (FalkorDB Browser API)
        // Protocol: http/https based on config (mapped from redis/rediss or http/s)
        // Usually http://localhost:3000
        const protocol = config.protocol === 'rediss' || config.protocol === 'https' ? 'https' : 'http';

        // Use Vite Proxy to bypass CORS for localhost:3000
        // Request -> /api -> Vite Server -> http://localhost:3000/api
        if (config.host === 'localhost' && config.port === '3000' && protocol === 'http') {
            this.baseUrl = '/api';
        } else {
            this.baseUrl = `${protocol}://${config.host}:${config.port}/api`;
        }

        console.log('🔌 FalkorDB HTTP Client initialized:', this.baseUrl);
    }

    async testConnection(config: ConnectionConfig): Promise<true | string> {
        // Initialize temporarily to test
        const protocol = config.protocol === 'rediss' || config.protocol === 'https' ? 'https' : 'http';

        let testBaseUrl = '';
        if (config.host === 'localhost' && config.port === '3000' && protocol === 'http') {
            testBaseUrl = '/api';
        } else {
            testBaseUrl = `${protocol}://${config.host}:${config.port}/api`;
        }

        try {
            console.log('🔍 Testing connection to:', testBaseUrl);
            const token = await this.loginInternal(testBaseUrl, config);

            // If we got a token, we are good!
            // Optionally stick it in state
            if (token) {
                this.initialize(config);
                this.accessToken = token;
                return true;
            }
            return 'Authentication failed (No token returned)';
        } catch (error: any) {
            console.error('❌ Connection test failed:', error);
            return error.message || 'Connection failed';
        }
    }

    /**
     * Perform login request to get JWT
     */
    private async loginInternal(baseUrl: string, config: ConnectionConfig): Promise<string> {
        // Endpoint: POST /auth/tokens/credentials
        // Note: The "host" and "port" in the BODY are for the BFF to connect to the DB.
        // In the standard docker container, the DB is at 'localhost:6379' (internal loopback).
        // The user config likely points to localhost:3000 (browser).
        // So we hardcode internal DB pointer or allow override? 
        // For the "Happy Path" (Docker), it's localhost:6379.

        const payload: any = {
            username: config.username || 'default', // Default user (Redis 6+ standard)
            password: config.password || '',
            host: 'localhost', // Internal DB Host (inside container)
            port: '6379',      // Internal DB Port (Send as String)
        };

        // Only add tls if true/needed (API might reject explicit 'false')
        if (config.protocol === 'rediss' || config.protocol === 'https') {
            payload.tls = true;
        }

        const res = await fetch(`${baseUrl}/auth/tokens/credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Auth failed: ${res.status} ${res.statusText} - ${txt}`);
        }

        // Response is the token string directly? Or JSON?
        // Let's assume text for now based on typical simple JWT handlers, 
        // but handle JSON if returned.
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            return json.token || json; // Handle { token: "..." } or "..."
        } catch {
            return text; // It's just a raw string
        }
    }

    async checkConnection(): Promise<boolean> {
        return !!this.accessToken;
    }

    async close(): Promise<void> {
        this.accessToken = null;
    }

    // --- Query Execution ---

    async executeQuery(cypherQuery: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
        // For V28, we perform the query but return empty visualization
        // until we port the transformer completely.
        const result = await this.runQuery(cypherQuery);
        console.log('FalkorDB Raw Result:', result);
        return { nodes: [], edges: [] };
    }

    async runQuery(cypher: string, params: Record<string, unknown> = {}): Promise<GraphResult> {
        if (!this.accessToken) {
            throw new Error('Not connected. Please login first.');
        }

        // API supports GET for queries based on docs.
        // URL Encode the query.
        // Params? FalkorDB Browser API might not support params in GET query string easily.
        // We will inject params client-side for now (Simplest for V28).
        // WARNING: Injection risk if not safe, but acceptable for local MVP.
        const interpolatedCypher = this.interpolateParams(cypher, params);
        const encodedQuery = encodeURIComponent(interpolatedCypher);

        const url = `${this.baseUrl}/graph/${this.graphName}?query=${encodedQuery}`;

        try {
            const res = await fetch(url, {
                method: 'GET', // Or POST if supported
                headers: {
                    'x-auth-token': this.accessToken // Common header for this API
                }
            });

            if (res.status === 401) {
                // Token expired? Try re-login once (Not implemented for brevity, just throw)
                throw new Error('Unauthorized: Token expired');
            }

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Query failed: ${res.status} - ${err}`);
            }

            const json = await res.json();
            return this.normalizeResult(json, interpolatedCypher, params);

        } catch (e) {
            console.error('FalkorDB Query Error:', e);
            throw e;
        }
    }

    // --- Internal Helpers ---

    private interpolateParams(cypher: string, params: Record<string, unknown>): string {
        let query = cypher;
        for (const key in params) {
            // Very basic replacement: $param -> value
            // Needs proper escaping for strings
            const val = params[key];
            const safeVal = typeof val === 'string' ? `'${val.replace(/'/g, "\\'")}'` : String(val);
            query = query.replace(new RegExp(`\\$${key}\\b`, 'g'), safeVal);
        }
        return query;
    }

    private normalizeResult(response: any, query: string, params: any): GraphResult {
        // Inspecting FalkorDB Browser JSON format (Hypothesis based on RedisGraph output):
        // Typically { header: [{ name, type }], data: [[val, val], ...], statistics: {} }

        // If response is raw generic object?
        // Let's assume standard shape.

        // Safety check
        const defaultCounters = {
            nodesCreated: 0,
            nodesDeleted: 0,
            relationshipsCreated: 0,
            relationshipsDeleted: 0,
            propertiesSet: 0,
            labelsAdded: 0,
            labelsRemoved: 0,
            indexesAdded: 0,
            indexesRemoved: 0,
            constraintsAdded: 0,
            constraintsRemoved: 0
        };

        if (!response) return { records: [], summary: { query, params, counters: defaultCounters } };

        const header: Array<{ name: string, type: number }> = response.header || [];
        const rows: any[][] = response.data || []; // 'data' or 'results'? 

        const records: StandardRecord[] = rows.map((row) => {
            const rec: StandardRecord = {};
            row.forEach((colVal, idx) => {
                const colDef = header[idx];
                if (colDef) {
                    rec[colDef.name] = this.normalizeValue(colVal);
                }
            });
            return rec;
        });

        const stats = response.statistics || response.stats || []; // Handle both keys

        // Initialize with defaults to satisfy GraphQuerySummary type
        const counters: any = {
            nodesCreated: 0,
            nodesDeleted: 0,
            relationshipsCreated: 0,
            relationshipsDeleted: 0,
            propertiesSet: 0,
            labelsAdded: 0,
            labelsRemoved: 0,
            indexesAdded: 0,
            indexesRemoved: 0,
            constraintsAdded: 0,
            constraintsRemoved: 0
        };

        if (Array.isArray(stats)) {
            stats.forEach((s: string) => {
                const parts = s.split(': ');
                if (parts.length === 2) {
                    const key = this.mapStatKey(parts[0]);
                    if (key) counters[key] = parseInt(parts[1]);
                }
            });
        }

        return {
            records,
            summary: {
                query,
                params,
                counters
            }
        };
    }

    private normalizeValue(val: any): any {
        return val;
    }

    private mapStatKey(stat: string): string | null {
        // Map "Nodes created" -> "nodesCreated"
        const map: Record<string, string> = {
            'Nodes created': 'nodesCreated',
            'Nodes deleted': 'nodesDeleted',
            'Relationships created': 'relationshipsCreated',
            'Relationships deleted': 'relationshipsDeleted',
            'Properties set': 'propertiesSet',
            'Labels added': 'labelsAdded',
            'Labels removed': 'labelsRemoved',
            'Indexes added': 'indexesAdded',
            'Indexes removed': 'indexesRemoved',
            'Constraints added': 'constraintsAdded',
            'Constraints removed': 'constraintsRemoved'
        };
        return map[stat] || null;
    }

    // --- CRUD Stubs ---
    // Using runQuery

    async createNode(name: string): Promise<string> {
        // FalkorDB uses id(n)
        const result = await this.runQuery(
            `CREATE (n {name: '${name}'}) RETURN id(n) AS id`
        );
        if (result.records.length > 0) return String(result.records[0].id);
        throw new Error('No ID returned');
    }

    async deleteNode(id: string): Promise<void> {
        await this.runQuery(`MATCH (n) WHERE id(n) = ${id} DETACH DELETE n`);
    }

    async updateNodeName(id: string, name: string): Promise<void> {
        await this.runQuery(`MATCH (n) WHERE id(n) = ${id} SET n.name = '${name}'`);
    }

    // Dashboard management - using stored Cypher nodes logic
    async getDashboards(): Promise<DashboardMeta[]> {
        const result = await this.runQuery(
            `MATCH (d:_GraphiveDashboard)
              RETURN id(d) AS id, d.name AS name, d.query AS query, d.layout AS layout, 
                     d.createdAt AS createdAt, d.updatedAt AS updatedAt, d.order AS order
              ORDER BY d.order ASC, d.updatedAt DESC`
        );
        return result.records.map(r => ({
            id: String(r.id),
            name: r.name,
            query: r.query, // Returns string
            layout: r.layout,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            order: r.order
        }));
    }

    async renameDashboard(id: string, name: string): Promise<void> {
        await this.runQuery(`MATCH (d:_GraphiveDashboard) WHERE id(d) = ${id} SET d.name = '${name}', d.updatedAt = '${new Date().toISOString()}'`);
    }

    // Stub remaining
    async updateNodeProperty(nodeId: string, key: string, value: unknown): Promise<void> { throw new Error('Method not implemented.'); }
    async deleteNodeProperty(nodeId: string, key: string): Promise<void> { throw new Error('Method not implemented.'); }
    async addNodeLabel(nodeId: string, label: string): Promise<void> { throw new Error('Method not implemented.'); }
    async removeNodeLabel(nodeId: string, label: string): Promise<void> { throw new Error('Method not implemented.'); }
    async expandNeighbors(nodeId: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[]; }> { return { nodes: [], edges: [] }; }
    async createEdge(edgeId: string, sourceId: string, targetId: string, label?: string): Promise<void> { throw new Error('Method not implemented.'); }
    async updateEdgeLabel(edgeId: string, newLabel: string): Promise<void> { throw new Error('Method not implemented.'); }
    async deleteEdge(edgeId: string): Promise<void> { throw new Error('Method not implemented.'); }
    async reverseRelationship(edgeId: string): Promise<{ newSource: string; newTarget: string; }> { throw new Error('Method not implemented.'); }
    async migrateRelationship(edgeId: string, newSourceId: string, newTargetId: string): Promise<void> { throw new Error('Method not implemented.'); }
    async getDashboard(id: string): Promise<DashboardMeta | null> { return null; }
    async saveDashboard(id: string | null, name: string, query: string, layout: string): Promise<string> { throw new Error('Method not implemented.'); }
    async saveDashboardsOrder(ids: string[]): Promise<void> { }
    async deleteDashboard(id: string): Promise<void> { }
}
