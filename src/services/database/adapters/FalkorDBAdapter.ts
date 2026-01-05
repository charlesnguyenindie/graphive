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
        const protocol = (config.protocol === 'rediss' || config.protocol === 'https') ? 'https' : 'http';
        this.baseUrl = `${protocol}://${config.host}:${config.port}`; // e.g. http://localhost:3000

        // Try to restore token from session (fix for reload delay)
        const storageKey = `falkordb_token_${config.host}_${config.port}`;
        const storedToken = sessionStorage.getItem(storageKey);
        if (storedToken) {
            this.accessToken = storedToken;
            console.log('⚡️ Restored FalkorDB token from session');
        }
        // Usually http://localhost:3000

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
            const token = json.token || json;

            // Persist for reload
            try {
                const storageKey = `falkordb_token_${config.host}_${config.port}`;
                sessionStorage.setItem(storageKey, token);
            } catch (e) {
                console.warn('Failed to persist token:', e);
            }

            return token;
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
        const result = await this.runQuery(cypherQuery);
        return this.processGraphResult(result);
    }

    private processGraphResult(result: GraphResult): { nodes: Node<NodeData>[]; edges: Edge[] } {
        const nodesMap = new Map<string, Node<NodeData>>();
        const edgesMap = new Map<string, Edge>();

        result.records.forEach((record) => {
            Object.values(record).forEach((value) => {
                if (!value) return;

                // Identify Node: has id (number/string), labels (array), properties (object)
                // properties check is safe, labels check is specific to graph node
                if (
                    'id' in value &&
                    'labels' in value &&
                    Array.isArray(value.labels) &&
                    'properties' in value
                ) {
                    // V30: Skip internal dashboard nodes (match Neo4j behavior)
                    if (value.labels.includes('_GraphiveDashboard')) {
                        return;
                    }

                    const id = String(value.id);
                    if (!nodesMap.has(id)) {
                        const props = value.properties as Record<string, any> || {};
                        nodesMap.set(id, {
                            id,
                            type: 'rectangle', // Default to rectangle
                            position: { x: 0, y: 0 }, // Layout will handle this
                            data: {
                                ...props, // Flatten properties into data
                                label: props.name || value.labels[0] || `Node ${id}`,
                                _labels: value.labels, // Internal meta
                                _elementId: id,
                                color: '#333' // Default color
                            }
                        });
                    }
                }

                // Identify Edge: FalkorDB Browser API format
                // FalkorDB uses: { id, relationshipType, sourceId, destinationId, properties }
                // (Different from RedisGraph which uses: type, start, end)
                if (
                    'id' in value &&
                    ('relationshipType' in value || 'type' in value) &&
                    ('sourceId' in value || 'start' in value || 'startNode' in value) &&
                    ('destinationId' in value || 'end' in value || 'endNode' in value)
                ) {
                    // V30: Use property id if available (persisted by createEdge), fallback to internal id
                    const props = value.properties as Record<string, any> || {};
                    const id = props.id ? String(props.id) : `e${value.id}`;
                    if (!edgesMap.has(id)) {
                        // Handle FalkorDB Browser API format (sourceId/destinationId) and legacy format (start/end)
                        const source = String(value.sourceId ?? value.start ?? value.startNode);
                        const target = String(value.destinationId ?? value.end ?? value.endNode);
                        const relType = value.relationshipType ?? value.type;

                        edgesMap.set(id, {
                            id,
                            source,
                            target,
                            // V30: Set handle IDs to match Neo4j behavior (bottom -> top flow)
                            sourceHandle: 'bottom-h',
                            targetHandle: 'top-h',
                            type: 'custom', // SmartEdge
                            label: relType,
                            data: {
                                ...props, // Flatten properties
                                label: props.label || relType, // Prefer persisted label
                                _elementId: id
                            },
                        });
                    }
                }
            });
        });

        return {
            nodes: Array.from(nodesMap.values()),
            edges: Array.from(edgesMap.values())
        };
    }

    /**
     * Ensure we have a valid token (Lazy Login)
     * This handles page refreshes where config is loaded but token is missing.
     */
    private async ensureConnection(): Promise<void> {
        if (!this.accessToken && this.currentConfig) {
            console.log('🔄 Restoring FalkorDB session...');
            const protocol = this.currentConfig.protocol === 'rediss' || this.currentConfig.protocol === 'https' ? 'https' : 'http';
            let loginUrl = '';

            if (this.currentConfig.host === 'localhost' && this.currentConfig.port === '3000' && protocol === 'http') {
                loginUrl = '/api';
            } else {
                loginUrl = `${protocol}://${this.currentConfig.host}:${this.currentConfig.port}/api`;
            }

            try {
                const token = await this.loginInternal(loginUrl, this.currentConfig);
                if (token) {
                    this.accessToken = token;
                    console.log('✅ Session restored');
                }
            } catch (e) {
                console.error('Failed to restore session:', e);
                // Throwing here will bubble up as "Auth failed" to the UI
                throw e;
            }
        }
    }

    async runQuery(cypher: string, params: Record<string, unknown> = {}): Promise<GraphResult> {
        // Try to restore session if missing
        await this.ensureConnection();

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

            // FalkorDB Browser API returns Server-Sent Events (text/event-stream)
            // Format:
            // event: result
            // data: { ... JSON ... }
            //
            // event: err
            // data: Error message

            const text = await res.text();

            // Proper SSE Parser (handles multi-line data)
            const lines = text.split('\n');
            let currentEvent: string | null = null;
            let dataBuffer: string[] = [];
            let resultData: any = null;
            let errorData: string | null = null;

            const processEvent = () => {
                if (!currentEvent) return;
                const fullData = dataBuffer.join('\n'); // Unify buffer

                if (currentEvent === 'err') {
                    errorData = fullData;
                } else if (currentEvent === 'result') {
                    if (!fullData.trim()) return;
                    try {
                        resultData = JSON.parse(fullData);
                    } catch (parseErr) {
                        console.error('Failed to parse SSE data JSON:', fullData);
                        throw new Error('Invalid JSON in query response');
                    }
                }

                // Reset buffer
                dataBuffer = [];
                currentEvent = null;
            };

            for (const line of lines) {
                const trimmed = line.trim(); // Be careful with trim, but usually safe for SSE structure

                if (!trimmed) {
                    // Empty line = end of event
                    processEvent();
                    continue;
                }

                if (trimmed.startsWith('event:')) {
                    // If we were building an event without an empty line termination, process it now (safety)
                    if (currentEvent) processEvent();
                    currentEvent = trimmed.substring(6).trim();
                } else if (trimmed.startsWith('data:')) {
                    // Accumulate data
                    // Note: substring(5) removes 'data:' but keeps spaces. 
                    // Typically 'data: {' -> ' {'
                    const content = line.substring(line.indexOf('data:') + 5).trim();
                    dataBuffer.push(content);
                }
            }
            // Process any trailing event
            processEvent();

            if (errorData) {
                throw new Error(`FalkorDB Error: ${errorData}`);
            }

            if (!resultData) {
                // If no result and no error, maybe it's just an empty success (e.g. CREATE)?
                // But normally 'result' event sends statistics.
                // Assuming empty query if nothing parsed.
                // throw new Error('No result data received from FalkorDB');
                // Let's return empty structure
                return this.normalizeResult(null, interpolatedCypher, params);
            }

            return this.normalizeResult(resultData, interpolatedCypher, params);

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
            // Handle HTTP API format where row might be an object { col: val }
            if (!Array.isArray(row)) {
                // If it's already an object, just use it (assuming keys match)
                // We might need to normalization if values are special types, 
                // but for simple create/read this is likely sufficient.
                return row as StandardRecord;
            }

            // Handle Tuple format (Redis-like) where row is [val, val]
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
    async updateNodeProperty(nodeId: string, key: string, value: unknown): Promise<void> {
        // Handle string escaping roughly
        const val = typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : JSON.stringify(value);
        await this.runQuery(`MATCH (n) WHERE id(n) = ${nodeId} SET n.${key} = ${val}`);
    }

    async deleteNodeProperty(nodeId: string, key: string): Promise<void> {
        await this.runQuery(`MATCH (n) WHERE id(n) = ${nodeId} REMOVE n.${key}`);
    }

    // Label management (FalkorDB supports labels similarly)
    async addNodeLabel(nodeId: string, label: string): Promise<void> {
        await this.runQuery(`MATCH (n) WHERE id(n) = ${nodeId} SET n:${label}`);
    }

    async removeNodeLabel(nodeId: string, label: string): Promise<void> {
        await this.runQuery(`MATCH (n) WHERE id(n) = ${nodeId} REMOVE n:${label}`);
    }

    async expandNeighbors(nodeId: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[]; }> {
        // Retrieve 1-hop neighborhood
        const result = await this.runQuery(
            `MATCH (n)-[r]-(m) WHERE id(n) = ${nodeId} RETURN m, r`
        );
        return this.processGraphResult(result);
    }

    /**
     * V33: Fetch specific nodes and edges by ID for dashboard restore
     */
    async fetchGraphData(nodeIds: string[], edgeIds: string[]): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
        if (nodeIds.length === 0 && edgeIds.length === 0) {
            return { nodes: [], edges: [] };
        }

        // FalkorDB uses integer IDs with id() function
        // Build query with inline IDs (FalkorDB HTTP API may not support array params well)
        const nodeIdList = nodeIds.join(', ');
        const edgeIdList = edgeIds.map(e => `'${e}'`).join(', '); // Edge IDs are stored as string property

        const query = nodeIds.length > 0
            ? `MATCH (n)
               WHERE id(n) IN [${nodeIdList}]
               OPTIONAL MATCH (n)-[r]-(m)
               WHERE r.id IN [${edgeIdList}]
               RETURN n, r, m`
            : `MATCH (n)-[r]-(m)
               WHERE r.id IN [${edgeIdList}]
               RETURN n, r, m`;

        const result = await this.runQuery(query);
        return this.processGraphResult(result);
    }

    async createEdge(edgeId: string, sourceId: string, targetId: string, label: string = 'LINK'): Promise<void> {
        // V30: Store edge ID as property for persistence across reloads
        // FalkorDB: MATCH (a), (b) WHERE id(a) = ... AND id(b) = ... CREATE (a)-[r:REL {id: ...}]->(b)
        await this.runQuery(
            `MATCH (a), (b) 
             WHERE id(a) = ${sourceId} AND id(b) = ${targetId} 
             CREATE (a)-[r:${label} {id: '${edgeId}'}]->(b)`
        );
    }
    async updateEdgeLabel(edgeId: string, newLabel: string): Promise<void> {
        // FalkorDB/Cypher limitation: Can't change relationship type directly.
        // Workaround: Create new relationship with new type, copy properties, delete old.
        // First, get the old relationship's type and properties
        const matchResult = await this.runQuery(
            `MATCH (a)-[r]->(b) WHERE r.id = '${edgeId}' 
             RETURN id(a) AS sourceId, id(b) AS targetId, type(r) AS relType, properties(r) AS props`
        );

        if (matchResult.records.length === 0) {
            throw new Error(`Edge with id ${edgeId} not found`);
        }

        const record = matchResult.records[0];
        const sourceId = record.sourceId;
        const targetId = record.targetId;
        const props = record.props || {};

        // Delete old relationship
        await this.runQuery(`MATCH ()-[r]->() WHERE r.id = '${edgeId}' DELETE r`);

        // Create new relationship with new label, preserving properties including id
        const propsStr = Object.entries({ ...props, id: edgeId })
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v)}`)
            .join(', ');

        await this.runQuery(
            `MATCH (a), (b) WHERE id(a) = ${sourceId} AND id(b) = ${targetId}
             CREATE (a)-[r:${newLabel} {${propsStr}}]->(b)`
        );
    }

    async deleteEdge(edgeId: string): Promise<void> {
        // V30: Edge ID is stored as property {id: '...'}
        await this.runQuery(`MATCH ()-[r]->() WHERE r.id = '${edgeId}' DELETE r`);
    }

    async reverseRelationship(edgeId: string): Promise<{ newSource: string; newTarget: string; }> {
        // Step 1: Get relationship info
        const matchResult = await this.runQuery(
            `MATCH (a)-[r]->(b) WHERE r.id = '${edgeId}' 
             RETURN id(a) AS sourceId, id(b) AS targetId, type(r) AS relType, properties(r) AS props`
        );

        if (matchResult.records.length === 0) {
            throw new Error(`Edge with id ${edgeId} not found`);
        }

        const record = matchResult.records[0];
        const sourceId = record.sourceId;
        const targetId = record.targetId;
        const relType = record.relType;
        const props = record.props || {};

        // Step 2: Delete old relationship
        await this.runQuery(`MATCH ()-[r]->() WHERE r.id = '${edgeId}' DELETE r`);

        // Step 3: Create reversed relationship (b -> a) with same properties
        const propsStr = Object.entries(props)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v)}`)
            .join(', ');

        await this.runQuery(
            `MATCH (a), (b) WHERE id(a) = ${targetId} AND id(b) = ${sourceId}
             CREATE (a)-[r:${relType} {${propsStr}}]->(b)`
        );

        // Return swapped IDs (newSource = old target, newTarget = old source)
        return { newSource: String(targetId), newTarget: String(sourceId) };
    }

    async migrateRelationship(edgeId: string, newSourceId: string, newTargetId: string): Promise<void> {
        // Step 1: Get old relationship info
        const matchResult = await this.runQuery(
            `MATCH ()-[r]->() WHERE r.id = '${edgeId}' 
             RETURN type(r) AS relType, properties(r) AS props`
        );

        if (matchResult.records.length === 0) {
            throw new Error(`Edge with id ${edgeId} not found`);
        }

        const record = matchResult.records[0];
        const relType = record.relType;
        const props = record.props || {};

        // Step 2: Delete old relationship
        await this.runQuery(`MATCH ()-[r]->() WHERE r.id = '${edgeId}' DELETE r`);

        // Step 3: Create new relationship between new nodes with same properties
        const propsStr = Object.entries(props)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v)}`)
            .join(', ');

        await this.runQuery(
            `MATCH (a), (b) WHERE id(a) = ${newSourceId} AND id(b) = ${newTargetId}
             CREATE (a)-[r:${relType} {${propsStr}}]->(b)`
        );
    }
    async getDashboard(id: string): Promise<DashboardMeta | null> {
        const result = await this.runQuery(
            `MATCH (d:_GraphiveDashboard) 
             WHERE id(d) = ${id}
             RETURN id(d) AS id, d.name AS name, d.query AS query, d.layout AS layout, 
                    d.createdAt AS createdAt, d.updatedAt AS updatedAt, d.order AS order`
        );

        if (result.records.length === 0) return null;

        const r = result.records[0];
        return {
            id: String(r.id),
            name: r.name,
            query: r.query,
            layout: r.layout,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            order: r.order
        };
    }

    async saveDashboard(id: string | null, name: string, query: string, layout: string): Promise<string> {
        const now = new Date().toISOString();
        // V36: Improved escaping for FalkorDB string interpolation
        // Order matters: escape backslashes first, then quotes, then handle newlines
        const escapeForCypher = (str: string) => str
            .replace(/\\/g, '\\\\')     // Escape backslashes first
            .replace(/'/g, "\\'")       // Escape single quotes
            .replace(/\n/g, '\\n')      // Escape newlines
            .replace(/\r/g, '\\r');     // Escape carriage returns

        const safeLayout = escapeForCypher(layout);
        const safeQuery = escapeForCypher(query);
        const safeName = escapeForCypher(name);

        if (id) {
            // Update existing
            await this.runQuery(
                `MATCH (d:_GraphiveDashboard) 
                 WHERE id(d) = ${id}
                 SET d.name = '${safeName}', 
                     d.query = '${safeQuery}', 
                     d.layout = '${safeLayout}', 
                     d.updatedAt = '${now}'`
            );
            return id;
        } else {
            // Create new
            const result = await this.runQuery(
                `CREATE (d:_GraphiveDashboard {
                    name: '${safeName}',
                    query: '${safeQuery}',
                    layout: '${safeLayout}',
                    createdAt: '${now}',
                    updatedAt: '${now}',
                    order: 999
                 }) RETURN id(d) as id`
            );
            if (result.records.length > 0) return String(result.records[0].id);
            throw new Error('Failed to create dashboard');
        }
    }

    async saveDashboardsOrder(ids: string[]): Promise<void> {
        // FalkorDB might not support UNWIND well with params yet via HTTP/Graph, 
        // using sequential updates or simple UNWIND query if stringified
        // Let's do a loop for simplicity and safety with current adapter state
        for (let i = 0; i < ids.length; i++) {
            await this.runQuery(`MATCH (d:_GraphiveDashboard) WHERE id(d) = ${ids[i]} SET d.order = ${i}`);
        }
    }

    async deleteDashboard(id: string): Promise<void> {
        await this.runQuery(`MATCH (d:_GraphiveDashboard) WHERE id(d) = ${id} DETACH DELETE d`);
    }
}
