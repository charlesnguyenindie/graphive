/**
 * Neo4j Database Adapter
 * V16 Phase 1B: Connection management + Query execution
 */

import neo4j, { Driver, Session, Record as Neo4jRecord, Node as Neo4jNode, Relationship } from 'neo4j-driver';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../../../store/useGraphStore';
import { ConnectionConfig, Protocol, DEFAULT_PORTS, GraphDBAdapter, DashboardMeta } from '../types';

// ============================================================
// Connection Helpers
// ============================================================

/**
 * Normalize port - use default if empty or missing
 */
function normalizePort(port: string | undefined, protocol: Protocol): string {
    if (port && port.trim() !== '') {
        return port.trim();
    }
    return DEFAULT_PORTS[protocol];
}

/**
 * Build connection URI from config
 */
function buildConnectionUri(config: ConnectionConfig): string {
    const normalizedPort = normalizePort(config.port, config.protocol);
    return `${config.protocol}://${config.host}:${normalizedPort}`;
}

/**
 * Generate a unique key for a connection config (for cache invalidation)
 */
function getConnectionKey(config: ConnectionConfig): string {
    return `${config.protocol}://${config.host}:${config.port}/${config.username}`;
}

// ============================================================
// Neo4j Adapter Implementation
// ============================================================

export class Neo4jAdapter implements GraphDBAdapter {
    readonly id = 'neo4j' as const;

    private driver: Driver | null = null;
    private currentConnectionKey: string | null = null;

    // --- Connection Management ---

    /**
     * Check if the driver is currently initialized
     */
    isInitialized(): boolean {
        return this.driver !== null;
    }

    /**
     * Initialize or get the Neo4j driver with dynamic configuration
     */
    initialize(config: ConnectionConfig): void {
        const newKey = getConnectionKey(config);

        // If same connection, reuse existing driver
        if (this.driver && this.currentConnectionKey === newKey) {
            return;
        }

        // Close existing driver if different connection
        if (this.driver) {
            this.driver.close().catch(console.error);
        }

        const uri = buildConnectionUri(config);
        this.driver = neo4j.driver(uri, neo4j.auth.basic(config.username, config.password));
        this.currentConnectionKey = newKey;

        console.log('🔌 Neo4j driver initialized:', uri);
    }

    /**
     * Test connection with provided credentials
     * Returns true if successful, or a human-friendly error message if failed
     */
    async testConnection(config: ConnectionConfig): Promise<true | string> {
        let testDriver: Driver | null = null;
        let testSession: Session | null = null;

        try {
            const uri = buildConnectionUri(config);
            console.log('🔍 Testing connection to:', uri);

            testDriver = neo4j.driver(uri, neo4j.auth.basic(config.username, config.password));
            testSession = testDriver.session();

            // Run a simple query to verify connectivity and authentication
            await testSession.run('RETURN 1');

            console.log('✅ Connection test successful');

            // If test passed, initialize the main driver
            this.initialize(config);

            return true;
        } catch (error) {
            console.error('❌ Connection test failed:', error);

            // Map Neo4j errors to human-friendly messages
            if (error instanceof Error) {
                const message = error.message.toLowerCase();

                if (message.includes('unauthorized') || message.includes('authentication')) {
                    return 'Incorrect username or password';
                }
                if (message.includes('serviceunavailable') || message.includes('connection refused')) {
                    return 'Server unreachable. Check the host and port.';
                }
                if (message.includes('dns') || message.includes('getaddrinfo')) {
                    return 'Host not found. Check the server address.';
                }
                if (message.includes('certificate') || message.includes('ssl') || message.includes('tls')) {
                    return 'SSL/TLS error. Try a different protocol (e.g., bolt+s or neo4j+s).';
                }
                if (message.includes('timeout')) {
                    return 'Connection timed out. Server may be slow or unreachable.';
                }

                return error.message;
            }

            return 'Unknown connection error';
        } finally {
            if (testSession) {
                await testSession.close().catch(() => { });
            }
            if (testDriver && testDriver !== this.driver) {
                await testDriver.close().catch(() => { });
            }
        }
    }

    /**
     * Check if Neo4j connection is alive
     */
    async checkConnection(): Promise<boolean> {
        try {
            const drv = this.getDriver();
            await drv.verifyConnectivity();
            console.log('✅ Neo4j connection verified');
            return true;
        } catch (error) {
            console.error('❌ Neo4j connection failed:', error);
            return false;
        }
    }

    /**
     * Close the Neo4j driver connection
     */
    async close(): Promise<void> {
        if (this.driver) {
            console.log('🔌 Closing Neo4j driver');
            await this.driver.close();
            this.driver = null;
            this.currentConnectionKey = null;
        }
    }

    // --- Internal Helpers ---

    /**
     * Get the current driver instance
     * Throws if not initialized
     */
    private getDriver(): Driver {
        if (!this.driver) {
            throw new Error('Neo4j driver not initialized. Please connect first.');
        }
        return this.driver;
    }

    // ============================================================
    // Query Execution (Phase 1B)
    // ============================================================

    /**
     * Execute a Cypher query and return transformed React Flow elements
     */
    async executeQuery(cypherQuery: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            const result = await session.run(cypherQuery);
            return transformNeo4jData(result.records);
        } finally {
            await session.close();
        }
    }

    /**
     * Generic query runner for CRUD operations
     * Handles transaction pooling and error logging
     */
    async runQuery<T = unknown>(
        cypher: string,
        params: Record<string, unknown> = {}
    ): Promise<T | null> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            console.log('🔄 Neo4j runQuery:', { cypher, params });
            const result = await session.run(cypher, params);
            console.log('✅ Neo4j query success:', result.summary.counters);
            return result as T;
        } catch (error) {
            console.error('❌ Neo4j query failed:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // ============================================================
    // Node CRUD (Phase 2A)
    // ============================================================

    /**
     * Create a node in Neo4j and return its elementId
     */
    async createNode(name: string): Promise<string> {
        const result = await this.runQuery<{ records: Neo4jRecord[] }>(
            'CREATE (n {name: $name}) RETURN elementId(n) AS id',
            { name }
        );

        // Extract ID from the result
        if (result && result.records && result.records.length > 0) {
            return result.records[0].get('id');
        }
        throw new Error('Failed to create node: No ID returned');
    }

    /**
     * Update a node's name in Neo4j
     */
    async updateNodeName(id: string, newName: string): Promise<void> {
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $id OR n.id = $id
             WITH n LIMIT 1
             SET n.name = $newName`,
            { id, newName }
        );
    }

    /**
     * Delete a node from Neo4j (DETACH removes edges first)
     */
    async deleteNode(id: string): Promise<void> {
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $id OR n.id = $id
             WITH n LIMIT 1
             DETACH DELETE n`,
            { id }
        );
    }

    // ============================================================
    // Property & Label CRUD (Phase 2B)
    // ============================================================

    /**
     * Update or add a property on a node
     */
    async updateNodeProperty(nodeId: string, key: string, value: unknown): Promise<void> {
        // Try APOC first, fallback to map merge
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $nodeId OR n.id = $nodeId
             WITH n LIMIT 1
             CALL apoc.create.setProperty(n, $key, $value) YIELD node
             RETURN node`,
            { nodeId, key, value }
        ).catch(async () => {
            // Fallback if APOC is not installed
            await this.runQuery(
                `MATCH (n)
                 WHERE elementId(n) = $nodeId OR n.id = $nodeId
                 WITH n LIMIT 1
                 SET n += $props`,
                { nodeId, props: { [key]: value } }
            );
        });
    }

    /**
     * Delete a property from a node
     */
    async deleteNodeProperty(nodeId: string, key: string): Promise<void> {
        // Try APOC first, fallback hierarchy
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $nodeId OR n.id = $nodeId
             WITH n LIMIT 1
             CALL apoc.create.removeProperty(n, $key) YIELD node
             RETURN node`,
            { nodeId, key }
        ).catch(async () => {
            // Fallback: set property to null (Neo4j 5+)
            await this.runQuery(
                `MATCH (n)
                 WHERE elementId(n) = $nodeId OR n.id = $nodeId
                 WITH n LIMIT 1
                 SET n[$key] = null`,
                { nodeId, key }
            ).catch(async () => {
                // Final fallback: map reconstruction
                await this.runQuery(
                    `MATCH (n)
                     WHERE elementId(n) = $nodeId OR n.id = $nodeId
                     WITH n LIMIT 1
                     SET n = apoc.map.removeKey(properties(n), $key)`,
                    { nodeId, key }
                );
            });
        });
    }

    /**
     * Add a label to a node
     */
    async addNodeLabel(nodeId: string, label: string): Promise<void> {
        // Sanitize label: only allow alphanumeric and underscore
        const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!sanitizedLabel) {
            throw new Error('Invalid label: must contain alphanumeric characters');
        }

        // Try APOC first, fallback to raw Cypher
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $nodeId OR n.id = $nodeId
             WITH n LIMIT 1
             CALL apoc.create.addLabels(n, [$label]) YIELD node
             RETURN node`,
            { nodeId, label: sanitizedLabel }
        ).catch(async () => {
            // Fallback: Use raw Cypher with backticks
            await this.runQuery(
                `MATCH (n)
                 WHERE elementId(n) = $nodeId OR n.id = $nodeId
                 WITH n LIMIT 1
                 SET n:\`${sanitizedLabel}\``,
                { nodeId }
            );
        });
    }

    /**
     * Remove a label from a node
     */
    async removeNodeLabel(nodeId: string, label: string): Promise<void> {
        const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!sanitizedLabel) {
            throw new Error('Invalid label: must contain alphanumeric characters');
        }

        // Try APOC first, fallback to raw Cypher
        await this.runQuery(
            `MATCH (n)
             WHERE elementId(n) = $nodeId OR n.id = $nodeId
             WITH n LIMIT 1
             CALL apoc.create.removeLabels(n, [$label]) YIELD node
             RETURN node`,
            { nodeId, label: sanitizedLabel }
        ).catch(async () => {
            // Fallback: Use raw Cypher with REMOVE
            await this.runQuery(
                `MATCH (n)
                 WHERE elementId(n) = $nodeId OR n.id = $nodeId
                 WITH n LIMIT 1
                 REMOVE n:\`${sanitizedLabel}\``,
                { nodeId }
            );
        });
    }

    /**
     * Expand neighbors of a node - returns connected nodes and relationships
     */
    async expandNeighbors(nodeId: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            console.log('🔍 Expanding neighbors for:', nodeId);

            const result = await session.run(
                `MATCH (n)
                 WHERE elementId(n) = $nodeId OR n.id = $nodeId
                 MATCH (n)-[r]-(neighbor)
                 RETURN n, r, neighbor`,
                { nodeId }
            );

            const transformed = transformNeo4jData(result.records);
            console.log('✅ Found neighbors:', {
                nodes: transformed.nodes.length,
                edges: transformed.edges.length
            });

            return transformed;
        } finally {
            await session.close();
        }
    }

    // ============================================================
    // Edge CRUD (Phase 2C)
    // ============================================================

    /**
     * Create an edge in Neo4j
     */
    async createEdge(edgeId: string, sourceId: string, targetId: string, label: string = 'LINK'): Promise<void> {
        await this.runQuery(
            `MATCH (a), (b) 
             WHERE (elementId(a) = $sID OR a.id = $sID) AND (elementId(b) = $tID OR b.id = $tID)
             CREATE (a)-[r:${label} {id: $rID}]->(b)`,
            { sID: sourceId, tID: targetId, rID: edgeId }
        );
    }

    /**
     * Update an edge's label in Neo4j
     */
    async updateEdgeLabel(edgeId: string, newLabel: string): Promise<void> {
        await this.runQuery(
            'MATCH ()-[r {id: $rID}]->() SET r.label = $newLabel',
            { rID: edgeId, newLabel }
        );
    }

    /**
     * Delete an edge from Neo4j
     */
    async deleteEdge(edgeId: string): Promise<void> {
        await this.runQuery(
            'MATCH ()-[r {id: $rID}]->() DELETE r',
            { rID: edgeId }
        );
    }

    /**
     * Reverse the direction of a relationship in Neo4j.
     * Transactional: DELETE old edge, CREATE new reversed edge.
     */
    async reverseRelationship(edgeId: string): Promise<{ newSource: string; newTarget: string }> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            console.log('🔄 Reversing relationship:', edgeId);

            const result = await session.executeWrite(async (tx) => {
                // Step 1: Find the relationship and its nodes
                const matchResult = await tx.run(
                    `MATCH (a)-[r {id: $id}]->(b)
                     RETURN a.id AS sourceId, b.id AS targetId, type(r) AS relType, properties(r) AS props`,
                    { id: edgeId }
                );

                if (matchResult.records.length === 0) {
                    throw new Error(`Relationship with id ${edgeId} not found`);
                }

                const record = matchResult.records[0];
                const sourceId = record.get('sourceId');
                const targetId = record.get('targetId');
                const relType = record.get('relType');
                const props = record.get('props');

                // Step 2: Delete the old relationship
                await tx.run(
                    'MATCH ()-[r {id: $id}]->() DELETE r',
                    { id: edgeId }
                );

                // Step 3: Create the reversed relationship with same properties
                await tx.run(
                    `MATCH (a {id: $newSourceId}), (b {id: $newTargetId})
                     CREATE (a)-[r:${relType} $props]->(b)`,
                    {
                        newSourceId: targetId,
                        newTargetId: sourceId,
                        props: props
                    }
                );

                console.log('✅ Relationship reversed:', {
                    oldDirection: `${sourceId} -> ${targetId}`,
                    newDirection: `${targetId} -> ${sourceId}`
                });

                return { newSource: targetId, newTarget: sourceId };
            });

            return result;
        } catch (error) {
            console.error('❌ Failed to reverse relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Migrate a relationship to new source/target nodes.
     * Transactional: DELETE old edge, CREATE new edge between new nodes.
     */
    async migrateRelationship(edgeId: string, newSourceId: string, newTargetId: string): Promise<void> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            console.log('🔀 Migrating relationship:', { edgeId, newSourceId, newTargetId });

            await session.executeWrite(async (tx) => {
                // Step 1: Find the relationship and its properties
                const matchResult = await tx.run(
                    `MATCH ()-[r {id: $id}]->()
                     RETURN type(r) AS relType, properties(r) AS props`,
                    { id: edgeId }
                );

                if (matchResult.records.length === 0) {
                    throw new Error(`Relationship with id ${edgeId} not found`);
                }

                const record = matchResult.records[0];
                const relType = record.get('relType');
                const props = record.get('props');

                // Step 2: Delete the old relationship
                await tx.run(
                    'MATCH ()-[r {id: $id}]->() DELETE r',
                    { id: edgeId }
                );

                // Step 3: Create new relationship between new nodes
                await tx.run(
                    `MATCH (a {id: $newSourceId}), (b {id: $newTargetId})
                     CREATE (a)-[r:${relType} $props]->(b)`,
                    {
                        newSourceId,
                        newTargetId,
                        props
                    }
                );

                console.log('✅ Relationship migrated:', {
                    edgeId,
                    from: `${newSourceId} -> ${newTargetId}`,
                    type: relType
                });
            });
        } catch (error) {
            console.error('❌ Failed to migrate relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // ============================================================
    // Dashboard Management (Phase 2D)
    // ============================================================

    /**
     * Get all dashboards
     */
    async getDashboards(): Promise<DashboardMeta[]> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            const result = await session.run(
                `MATCH (d:_GraphiveDashboard)
                 RETURN elementId(d) AS id, d.name AS name, d.query AS query, d.layout AS layout, 
                        d.createdAt AS createdAt, d.updatedAt AS updatedAt, d.order AS order
                 ORDER BY d.order ASC, d.updatedAt DESC`
            );

            return result.records.map(record => ({
                id: record.get('id'),
                name: record.get('name') || 'Untitled',
                query: record.get('query') || '',
                layout: record.get('layout') || '{}',
                order: record.get('order') !== null ? record.get('order').toNumber() : undefined,
                createdAt: record.get('createdAt'),
                updatedAt: record.get('updatedAt'),
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * Get a specific dashboard by ID
     */
    async getDashboard(id: string): Promise<DashboardMeta | null> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            const result = await session.run(
                `MATCH (d:_GraphiveDashboard)
                 WHERE elementId(d) = $id
                 RETURN elementId(d) AS id, d.name AS name, d.query AS query, d.layout AS layout,
                        d.createdAt AS createdAt, d.updatedAt AS updatedAt`,
                { id }
            );

            if (result.records.length === 0) return null;

            const record = result.records[0];
            return {
                id: record.get('id'),
                name: record.get('name') || 'Untitled',
                query: record.get('query') || '',
                layout: record.get('layout') || '{}',
                createdAt: record.get('createdAt'),
                updatedAt: record.get('updatedAt'),
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Save (create or update) a dashboard
     */
    async saveDashboard(id: string | null, name: string, query: string, layout: string): Promise<string> {
        const drv = this.getDriver();
        const session: Session = drv.session();
        const now = new Date().toISOString();

        try {
            if (id) {
                // Update existing
                await session.run(
                    `MATCH (d:_GraphiveDashboard)
                     WHERE elementId(d) = $id
                     SET d.name = $name, d.query = $query, d.layout = $layout, d.updatedAt = $updatedAt`,
                    { id, name, query, layout, updatedAt: now }
                );
                console.log('✅ Dashboard updated:', id);
                return id;
            } else {
                // Create new
                const result = await session.run(
                    `CREATE (d:_GraphiveDashboard {name: $name, query: $query, layout: $layout, createdAt: $createdAt, updatedAt: $updatedAt})
                     RETURN elementId(d) AS id`,
                    { name, query, layout, createdAt: now, updatedAt: now }
                );
                const newId = result.records[0].get('id');
                console.log('✅ Dashboard created:', newId);
                return newId;
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Save the order of dashboards
     */
    async saveDashboardsOrder(ids: string[]): Promise<void> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            await session.run(
                `UNWIND range(0, size($ids) - 1) AS i
                 MATCH (d:_GraphiveDashboard) WHERE elementId(d) = $ids[i]
                 SET d.order = i`,
                { ids }
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Delete a dashboard
     */
    async deleteDashboard(id: string): Promise<void> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            await session.run(
                `MATCH (d:_GraphiveDashboard)
                 WHERE elementId(d) = $id
                 DETACH DELETE d`,
                { id }
            );
            console.log('🗑️ Dashboard deleted:', id);
        } finally {
            await session.close();
        }
    }

    /**
     * Rename a dashboard
     */
    async renameDashboard(id: string, name: string): Promise<void> {
        const drv = this.getDriver();
        const session: Session = drv.session();

        try {
            await session.run(
                `MATCH (d:_GraphiveDashboard)
                 WHERE elementId(d) = $id
                 SET d.name = $name, d.updatedAt = datetime()`,
                { id, name }
            );
        } finally {
            await session.close();
        }
    }
}

// ============================================================
// Transformation Helpers (Phase 1B)
// ============================================================

/**
 * Transform Neo4j records into React Flow nodes and edges
 */
function transformNeo4jData(records: Neo4jRecord[]): { nodes: Node<NodeData>[]; edges: Edge[] } {
    const nodesMap = new Map<string, Node<NodeData>>();
    const edgesMap = new Map<string, Edge>();
    const internalToResolvedIdMap = new Map<string, string>();

    // Pass 1: Process Nodes to build ID map
    for (const record of records) {
        for (const key of record.keys) {
            const value = record.get(key);

            if (isNeo4jNode(value)) {
                // V15: Skip internal dashboard nodes
                if (value.labels.includes('_GraphiveDashboard')) {
                    continue;
                }

                // INTERNAL ID (for relationship mapping)
                const internalKey = value.elementId || value.identity.toString();

                // PROPERTIES
                const props = value.properties;

                // RESOLVED ID: Use property 'id' if available (creation consistency), else fallback to internal
                const resolvedId = props.id != null ? String(props.id) : internalKey;

                internalToResolvedIdMap.set(internalKey, resolvedId);

                if (!nodesMap.has(resolvedId)) {
                    nodesMap.set(resolvedId, {
                        id: resolvedId,
                        type: 'rectangle',
                        position: { x: 0, y: 0 }, // Will be set by layout
                        data: {
                            ...props, // V14 Fix: Include all raw properties
                            _elementId: internalKey, // V14: Internal ID for UI reference
                            _labels: value.labels,   // V14: Labels for UI reference
                        },
                    });
                }
            }
        }
    }

    // Pass 2: Process Relationships using resolved IDs
    for (const record of records) {
        for (const key of record.keys) {
            const value = record.get(key);

            if (isNeo4jRelationship(value)) {
                // INTERNAL ID
                const internalKey = value.elementId || value.identity.toString();
                const props = value.properties;
                const resolvedId = props.id != null ? String(props.id) : internalKey;

                if (!edgesMap.has(resolvedId)) {
                    // Resolve Source/Target using the map from Pass 1
                    const sourceInternal = value.startNodeElementId || value.start.toString();
                    const targetInternal = value.endNodeElementId || value.end.toString();

                    const sourceId = internalToResolvedIdMap.get(sourceInternal) || sourceInternal;
                    const targetId = internalToResolvedIdMap.get(targetInternal) || targetInternal;

                    edgesMap.set(resolvedId, {
                        id: resolvedId,
                        source: sourceId,
                        target: targetId,
                        // V6: Fix "Ugly" Edge - Enforce Bottom -> Top flow
                        sourceHandle: 'bottom-h',
                        targetHandle: 'top-h',
                        type: 'custom',
                        data: {
                            // Property 'label' takes precedence (for editable labels), fallback to relationship type
                            label: props.label || value.type,
                        },
                    });
                }
            }
        }
    }

    return {
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values()),
    };
}

/**
 * Type guard for Neo4j Node
 */
function isNeo4jNode(value: unknown): value is Neo4jNode {
    return (
        value !== null &&
        typeof value === 'object' &&
        'labels' in value &&
        'properties' in value &&
        ('identity' in value || 'elementId' in value)
    );
}

/**
 * Type guard for Neo4j Relationship
 */
function isNeo4jRelationship(value: unknown): value is Relationship {
    return (
        value !== null &&
        typeof value === 'object' &&
        'type' in value &&
        'properties' in value &&
        ('start' in value || 'startNodeElementId' in value)
    );
}

/**
 * Extract a display label from a Neo4j node (unused but available for future use)
 */
function getNodeLabel(node: Neo4jNode): string {
    const props = node.properties;

    // Try common label properties
    if (props.name) return String(props.name);
    if (props.title) return String(props.title);
    if (props.label) return String(props.label);
    if (props.id) return String(props.id);

    // Fall back to first label or generic
    if (node.labels.length > 0) {
        return `${node.labels[0]}`;
    }

    return 'Node';
}
