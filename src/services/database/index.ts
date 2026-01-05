/**
 * Database Service
 * V16: Manages the active database adapter and exposes a unified API
 */

import { ConnectionConfig, DashboardMeta, GraphDBAdapter, GraphResult } from './types';
import { Neo4jAdapter } from './adapters/Neo4jAdapter';
import { FalkorDBAdapter } from './adapters/FalkorDBAdapter';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../../store/useGraphStore';

// ============================================================
// Singleton Adapter Manager
// ============================================================

let activeAdapter: GraphDBAdapter | null = null;

/**
 * Get or create adapter based on provider
 */
function getOrCreateAdapter(provider: 'neo4j' | 'falkordb'): GraphDBAdapter {
    if (activeAdapter && activeAdapter.id === provider) {
        return activeAdapter;
    }

    // Close existing adapter if switching providers
    if (activeAdapter) {
        activeAdapter.close().catch(console.error);
    }

    switch (provider) {
        case 'neo4j':
            activeAdapter = new Neo4jAdapter();
            break;
        case 'falkordb':
            activeAdapter = new FalkorDBAdapter();
            break;
        default:
            throw new Error(`Unknown database provider: ${provider}`);
    }

    return activeAdapter;
}

/**
 * Get the current active adapter
 * Throws if not initialized
 */
export function getAdapter(): GraphDBAdapter {
    if (!activeAdapter) {
        throw new Error('No database adapter initialized. Please connect first.');
    }
    return activeAdapter;
}

/**
 * Check if an adapter is currently initialized
 */
export function isAdapterInitialized(): boolean {
    return activeAdapter !== null && activeAdapter.isInitialized();
}

/**
 * V34: Get the ID of the active adapter ('neo4j' or 'falkordb')
 */
export function getAdapterId(): 'neo4j' | 'falkordb' | null {
    return activeAdapter?.id ?? null;
}

// ============================================================
// Exported Functions (Delegate to Active Adapter)
// ============================================================

// --- Connection ---

export function initializeAdapter(config: ConnectionConfig): void {
    const adapter = getOrCreateAdapter(config.provider);
    adapter.initialize(config);
}

export async function testConnection(config: ConnectionConfig): Promise<true | string> {
    const adapter = getOrCreateAdapter(config.provider);
    return adapter.testConnection(config);
}

export async function checkConnection(): Promise<boolean> {
    return activeAdapter ? activeAdapter.checkConnection() : false;
}

export async function closeAdapter(): Promise<void> {
    if (activeAdapter) {
        await activeAdapter.close();
        activeAdapter = null;
    }
}

// --- Query Execution ---

export async function executeQuery(cypherQuery: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
    return getAdapter().executeQuery(cypherQuery);
}

export async function runQuery(cypher: string, params?: Record<string, unknown>): Promise<GraphResult> {
    return getAdapter().runQuery(cypher, params);
}

// --- Node CRUD ---

export async function createNode(name: string): Promise<string> {
    return getAdapter().createNode(name);
}

export async function updateNodeName(id: string, newName: string): Promise<void> {
    return getAdapter().updateNodeName(id, newName);
}

export async function deleteNode(id: string): Promise<void> {
    return getAdapter().deleteNode(id);
}

export async function updateNodeProperty(nodeId: string, key: string, value: unknown): Promise<void> {
    return getAdapter().updateNodeProperty(nodeId, key, value);
}

export async function deleteNodeProperty(nodeId: string, key: string): Promise<void> {
    return getAdapter().deleteNodeProperty(nodeId, key);
}

export async function addNodeLabel(nodeId: string, label: string): Promise<void> {
    return getAdapter().addNodeLabel(nodeId, label);
}

export async function removeNodeLabel(nodeId: string, label: string): Promise<void> {
    return getAdapter().removeNodeLabel(nodeId, label);
}

export async function expandNeighbors(nodeId: string): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
    return getAdapter().expandNeighbors(nodeId);
}

// V33: Fetch specific nodes/edges by ID
export async function fetchGraphData(nodeIds: string[], edgeIds: string[]): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] }> {
    return getAdapter().fetchGraphData(nodeIds, edgeIds);
}

// --- Edge CRUD ---

export async function createEdge(edgeId: string, sourceId: string, targetId: string, label?: string): Promise<void> {
    return getAdapter().createEdge(edgeId, sourceId, targetId, label);
}

export async function updateEdgeLabel(edgeId: string, newLabel: string): Promise<void> {
    return getAdapter().updateEdgeLabel(edgeId, newLabel);
}

export async function deleteEdge(edgeId: string): Promise<void> {
    return getAdapter().deleteEdge(edgeId);
}

export async function reverseRelationship(edgeId: string): Promise<{ newSource: string; newTarget: string }> {
    return getAdapter().reverseRelationship(edgeId);
}

export async function migrateRelationship(edgeId: string, newSourceId: string, newTargetId: string): Promise<void> {
    return getAdapter().migrateRelationship(edgeId, newSourceId, newTargetId);
}

// --- Dashboard Management ---

export async function getDashboards(): Promise<DashboardMeta[]> {
    return getAdapter().getDashboards();
}

export async function getDashboard(id: string): Promise<DashboardMeta | null> {
    return getAdapter().getDashboard(id);
}

export async function saveDashboard(id: string | null, name: string, query: string, layout: string): Promise<string> {
    return getAdapter().saveDashboard(id, name, query, layout);
}

export async function saveDashboardsOrder(ids: string[]): Promise<void> {
    return getAdapter().saveDashboardsOrder(ids);
}

export async function deleteDashboard(id: string): Promise<void> {
    return getAdapter().deleteDashboard(id);
}

export async function renameDashboard(id: string, name: string): Promise<void> {
    return getAdapter().renameDashboard(id, name);
}
