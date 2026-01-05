/**
 * Database Adapter Types
 * V16: Generic interface for multi-database support
 */

import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../../store/useGraphStore';

// ============================================================
// Connection Configuration
// ============================================================

export type Protocol = 'bolt' | 'bolt+s' | 'bolt+ssc' | 'neo4j' | 'neo4j+s' | 'neo4j+ssc' | 'http' | 'https';

export const DEFAULT_PORTS: Record<Protocol, string> = {
    bolt: '7687',
    'bolt+s': '7687',
    'bolt+ssc': '7687',
    neo4j: '7687',
    'neo4j+s': '7687',
    'neo4j+ssc': '7687',
    http: '7474',
    https: '7473',
};

export interface ConnectionConfig {
    provider: 'neo4j' | 'falkordb';
    protocol: Protocol;
    host: string;
    port?: string;
    username: string;
    password: string;
    database?: string; // Neo4j database name or FalkorDB graph key
}

// ============================================================
// Dashboard Metadata
// ============================================================

export interface DashboardMeta {
    id: string;
    name: string;
    query: string;
    layout: string; // JSON string
    order?: number;
    createdAt?: string;
    updatedAt?: string;
}

// ============================================================
// Graph Database Adapter Interface
// ============================================================

export interface GraphDBAdapter {
    readonly id: 'neo4j' | 'falkordb';

    // --- Connection Management ---
    isInitialized(): boolean;
    initialize(config: ConnectionConfig): void;
    testConnection(config: ConnectionConfig): Promise<true | string>;
    checkConnection(): Promise<boolean>;
    close(): Promise<void>;

    // --- Query Execution ---
    executeQuery(cypherQuery: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }>;
    runQuery<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T | null>;

    // --- Node CRUD ---
    createNode(name: string): Promise<string>; // Returns node ID
    updateNodeName(id: string, newName: string): Promise<void>;
    deleteNode(id: string): Promise<void>;
    updateNodeProperty(nodeId: string, key: string, value: unknown): Promise<void>;
    deleteNodeProperty(nodeId: string, key: string): Promise<void>;
    addNodeLabel(nodeId: string, label: string): Promise<void>;
    removeNodeLabel(nodeId: string, label: string): Promise<void>;
    expandNeighbors(nodeId: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }>;

    // --- Edge CRUD ---
    createEdge(edgeId: string, sourceId: string, targetId: string, label?: string): Promise<void>;
    updateEdgeLabel(edgeId: string, newLabel: string): Promise<void>;
    deleteEdge(edgeId: string): Promise<void>;
    reverseRelationship(edgeId: string): Promise<{ newSource: string; newTarget: string }>;
    migrateRelationship(edgeId: string, newSourceId: string, newTargetId: string): Promise<void>;

    // --- Dashboard Management ---
    getDashboards(): Promise<DashboardMeta[]>;
    getDashboard(id: string): Promise<DashboardMeta | null>;
    saveDashboard(id: string | null, name: string, query: string, layout: string): Promise<string>;
    saveDashboardsOrder(ids: string[]): Promise<void>;
    deleteDashboard(id: string): Promise<void>;
    renameDashboard(id: string, name: string): Promise<void>;
}
