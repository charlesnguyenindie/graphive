import { create } from 'zustand';
import {
    Node,
    Edge,
    Connection,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    reconnectEdge,
    XYPosition,
} from '@xyflow/react';
import {
    executeQuery as neo4jExecuteQuery,
    isDriverInitialized,
    checkConnection as neo4jCheckConnection,
    // V8: CRUD operations for sync
    createNode as neo4jCreateNode,
    updateNodeName as neo4jUpdateNodeName,
    deleteNode as neo4jDeleteNode,
    createEdge as neo4jCreateEdge,
    updateEdgeLabel as neo4jUpdateEdgeLabel,
    deleteEdge as neo4jDeleteEdge,
    // V10: Relationship reversal
    reverseRelationship as neo4jReverseRelationship,
    // V13: Edge migration
    migrateRelationship as neo4jMigrateRelationship,
} from '../services/neo4jService';
import { getLayoutedElements } from '../services/layoutService';
import { useToastStore } from './useToastStore';

export interface NodeData {
    label: string;
    collapsed?: boolean;
    isEditing?: boolean;
    isDraft?: boolean;  // V13: Draft nodes not yet persisted
    [key: string]: unknown;
}

export interface EdgeData {
    label?: string;
    isEditing?: boolean;
    [key: string]: unknown;
}

interface GraphState {
    nodes: Node<NodeData>[];
    edges: Edge[];
    highlightedNodeId: string | null;
    // V5: Neo4j query state
    isLoading: boolean;
    queryError: string | null;
    // V8: Sync state
    isSyncing: boolean;
    syncError: string | null;
    isNeo4jConnected: boolean;
    onNodesChange: OnNodesChange<Node<NodeData>>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    addNode: (type: 'rectangle' | 'circle', position: XYPosition) => void;
    commitDraftNode: (nodeId: string, label: string) => Promise<void>;  // V13
    discardDraftNode: (nodeId: string) => void;  // V13
    updateNodeLabel: (id: string, label: string) => void;
    toggleCollapse: (nodeId: string) => void;
    deleteSelected: () => void;
    onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
    setHighlightedNode: (nodeId: string | null) => void;
    // Performance: Direct setters for batch updates
    setNodes: (nodes: Node<NodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    // Inline editing
    setNodeEditing: (nodeId: string, isEditing: boolean) => void;
    // Edge actions
    // V10: Async edge flip with persistence
    flipEdge: (edgeId: string) => Promise<void>;
    setEdgeEditing: (edgeId: string, isEditing: boolean) => void;
    updateEdgeLabel: (edgeId: string, label: string) => void;
    // V5: Neo4j actions
    executeNeo4jQuery: (cypherQuery: string) => Promise<void>;
    clearCanvas: () => void;
    clearQueryError: () => void;
    // V8: Sync actions
    checkNeo4jConnection: () => Promise<void>;
    setSyncError: (error: string | null) => void;
}

// Helper: Get all descendant node IDs recursively
const getDescendants = (
    nodeId: string,
    edges: Edge[],
    visited: Set<string> = new Set()
): string[] => {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const childEdges = edges.filter((edge) => edge.source === nodeId);
    const childIds = childEdges.map((edge) => edge.target);

    const allDescendants: string[] = [...childIds];
    for (const childId of childIds) {
        allDescendants.push(...getDescendants(childId, edges, visited));
    }

    return allDescendants;
};

// V10: Start with empty canvas
const initialNodes: Node<NodeData>[] = [];

const initialEdges: Edge[] = [];

let nodeIdCounter = 5;

export const useGraphStore = create<GraphState>((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,
    highlightedNodeId: null,
    // V5: Neo4j query state
    isLoading: false,
    queryError: null,
    // V8: Sync state
    isSyncing: false,
    syncError: null,
    isNeo4jConnected: false,

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection) => {
        // V4: Prevent self-loops
        if (connection.source === connection.target) {
            console.log('❌ Store: Self-loop prevented');
            return;
        }

        // V8: Generate edge ID for sync
        const edgeId = `e${connection.source}-${connection.target}-${Date.now()}`;

        const newEdge = {
            ...connection,
            id: edgeId,
            // V7: Context-Aware Defaults (ensure null not undefined for type safety)
            sourceHandle: connection.sourceHandle ?? null,
            targetHandle: connection.targetHandle ?? null,
            source: connection.source,
            target: connection.target,
            type: 'custom',
            data: { label: '' },  // V13: Empty default label
        };

        console.log('📥 Store onConnect:', { connection, newEdge });

        // V8: Optimistic UI - apply immediately
        set({
            edges: addEdge(newEdge as Edge, get().edges),
            isSyncing: true,
        });

        // V8: Sync to Neo4j in background
        if (connection.source && connection.target) {
            neo4jCreateEdge(edgeId, connection.source, connection.target, 'LINK')
                .then(() => {
                    console.log('✅ Edge synced to Neo4j:', edgeId);
                    set({ isSyncing: false });
                })
                .catch((error) => {
                    console.error('❌ Failed to sync edge to Neo4j:', error);
                    // Rollback: remove the edge from UI
                    set({
                        edges: get().edges.filter((e) => e.id !== edgeId),
                        isSyncing: false,
                        syncError: error instanceof Error ? error.message : 'Failed to create edge',
                    });
                    useToastStore.getState().addToast('error', 'Failed to create connection');
                });
        }
    },

    // V13: Create draft node (no Neo4j call until committed)
    addNode: (type, position) => {
        const nodeId = String(nodeIdCounter++);
        const nodeLabel = `Node ${nodeIdCounter - 1}`;
        const newNode: Node<NodeData> = {
            id: nodeId,
            type,
            position,
            data: {
                label: '',  // V13: Empty default label
                isEditing: true,  // Auto-enter edit mode
                isDraft: true,    // Mark as draft (not persisted)
            },
        };

        // Add to UI only - no Neo4j call for drafts
        set({ nodes: [...get().nodes, newNode] });
        console.log('📝 Draft node created:', nodeId);
    },

    // V13: Commit draft node to Neo4j
    commitDraftNode: async (nodeId, label) => {
        const node = get().nodes.find(n => n.id === nodeId);
        if (!node || !node.data.isDraft) return;

        // Update UI: mark as not editing, not draft
        set({
            nodes: get().nodes.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, label, isEditing: false, isDraft: false } }
                    : n
            ),
            isSyncing: true,
        });

        try {
            await neo4jCreateNode(nodeId, label);
            console.log('✅ Draft node committed to Neo4j:', nodeId);
            set({ isSyncing: false });
            // V13: Show success toast
            useToastStore.getState().addToast('success', `Node "${label}" created`);
        } catch (error) {
            console.error('❌ Failed to commit draft node:', error);
            // Rollback: remove the node from UI
            set({
                nodes: get().nodes.filter(n => n.id !== nodeId),
                isSyncing: false,
                syncError: error instanceof Error ? error.message : 'Failed to create node',
            });
            // V13: Show error toast with specific message
            const errorMessage = error instanceof Error ? error.message : 'Failed to create node';
            const isConstraintError = errorMessage.includes('already exists');
            useToastStore.getState().addToast(
                'error',
                isConstraintError ? `Name "${label}" already exists` : errorMessage
            );
        }
    },

    // V13: Discard a draft node (never persisted)
    discardDraftNode: (nodeId) => {
        const node = get().nodes.find(n => n.id === nodeId);
        if (!node || !node.data.isDraft) return;

        set({
            nodes: get().nodes.filter(n => n.id !== nodeId),
        });
        console.log('🗑️ Draft node discarded:', nodeId);
    },

    updateNodeLabel: (id, label) => {
        // Store original state for rollback
        const originalNodes = get().nodes;
        const originalNode = originalNodes.find(n => n.id === id);
        const originalLabel = originalNode?.data.label;

        // V8: Optimistic UI - apply immediately
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, label } } : node
            ),
            isSyncing: true,
        });

        // V8: Sync to Neo4j in background
        neo4jUpdateNodeName(id, label)
            .then(() => {
                console.log('✅ Node name synced to Neo4j:', id);
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to sync node name to Neo4j:', error);
                // Rollback: restore original label
                set({
                    nodes: get().nodes.map((node) =>
                        node.id === id ? { ...node, data: { ...node.data, label: originalLabel ?? label } } : node
                    ),
                    isSyncing: false,
                    syncError: error instanceof Error ? error.message : 'Failed to update node name',
                });
                useToastStore.getState().addToast('error', 'Failed to update node name');
            });
    },

    toggleCollapse: (nodeId) => {
        const { nodes, edges } = get();
        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        const isCurrentlyCollapsed = targetNode.data.collapsed ?? false;
        const newCollapsedState = !isCurrentlyCollapsed;

        // Get all descendants of this node
        const descendantIds = getDescendants(nodeId, edges);

        // Update the target node's collapsed state and hide/show descendants
        const updatedNodes = nodes.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: { ...node.data, collapsed: newCollapsedState },
                };
            }
            if (descendantIds.includes(node.id)) {
                return {
                    ...node,
                    hidden: newCollapsedState,
                };
            }
            return node;
        });

        // Hide/show edges connected to descendants
        const updatedEdges = edges.map((edge) => {
            if (
                descendantIds.includes(edge.source) ||
                descendantIds.includes(edge.target)
            ) {
                return { ...edge, hidden: newCollapsedState };
            }
            return edge;
        });

        set({ nodes: updatedNodes, edges: updatedEdges });
    },

    deleteSelected: () => {
        const { nodes, edges } = get();

        // Store original state for rollback
        const originalNodes = nodes;
        const originalEdges = edges;

        const selectedNodeIds = nodes
            .filter((node) => node.selected)
            .map((node) => node.id);
        const selectedEdgeIds = edges
            .filter((edge) => edge.selected)
            .map((edge) => edge.id);

        // Remove selected nodes
        const remainingNodes = nodes.filter((node) => !node.selected);

        // Remove selected edges AND edges connected to deleted nodes
        const remainingEdges = edges.filter(
            (edge) =>
                !edge.selected &&
                !selectedNodeIds.includes(edge.source) &&
                !selectedNodeIds.includes(edge.target)
        );

        // V8: Optimistic UI - apply immediately
        set({ nodes: remainingNodes, edges: remainingEdges, isSyncing: true });

        // V8: Sync deletions to Neo4j in background
        const deletePromises: Promise<void>[] = [];

        // Delete selected edges from Neo4j
        for (const edgeId of selectedEdgeIds) {
            deletePromises.push(
                neo4jDeleteEdge(edgeId).catch((error) => {
                    console.error('❌ Failed to delete edge from Neo4j:', edgeId, error);
                    throw error; // Re-throw to trigger rollback
                })
            );
        }

        // Delete selected nodes from Neo4j (DETACH DELETE handles edges)
        for (const nodeId of selectedNodeIds) {
            deletePromises.push(
                neo4jDeleteNode(nodeId).catch((error) => {
                    console.error('❌ Failed to delete node from Neo4j:', nodeId, error);
                    throw error; // Re-throw to trigger rollback
                })
            );
        }

        Promise.all(deletePromises)
            .then(() => {
                console.log('✅ Deletions synced to Neo4j');
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Some deletions failed, rolling back:', error);
                // Rollback: restore original nodes and edges
                set({
                    nodes: originalNodes,
                    edges: originalEdges,
                    isSyncing: false,
                    syncError: 'Some deletions failed to sync',
                });
                useToastStore.getState().addToast('error', 'Delete failed - changes reverted');
            });
    },

    // V13: Edge re-parenting with optimistic UI and persistence
    onReconnect: (oldEdge, newConnection) => {
        // Store original state for rollback
        const originalEdges = get().edges;

        // Optimistic UI: Apply reconnection immediately
        const newEdges = reconnectEdge(oldEdge, newConnection, originalEdges);
        set({ edges: newEdges, isSyncing: true });

        // Get new source/target from the reconnected edge
        const updatedEdge = newEdges.find(e => e.id === oldEdge.id);
        if (!updatedEdge || !updatedEdge.source || !updatedEdge.target) {
            set({ isSyncing: false });
            return;
        }

        // Persist to Neo4j
        neo4jMigrateRelationship(oldEdge.id, updatedEdge.source, updatedEdge.target)
            .then(() => {
                console.log('✅ Edge migration synced to Neo4j:', oldEdge.id);
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to migrate edge in Neo4j:', error);
                // Rollback: restore original edges
                set({
                    edges: originalEdges,
                    isSyncing: false,
                    syncError: error instanceof Error ? error.message : 'Failed to migrate edge',
                });
                useToastStore.getState().addToast('error', 'Failed to move connection');
            });
    },

    setHighlightedNode: (nodeId) => {
        set({ highlightedNodeId: nodeId });
        // Auto-clear highlight after 2 seconds
        if (nodeId) {
            setTimeout(() => {
                set({ highlightedNodeId: null });
            }, 2000);
        }
    },

    // Performance: Direct setters for batch updates
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    // Inline editing
    setNodeEditing: (nodeId, isEditing) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, isEditing } }
                    : node
            ),
        });
    },

    // V10: Edge reversal - optimistic UI with DB persistence
    flipEdge: async (edgeId) => {
        const edges = get().edges;
        const edge = edges.find(e => e.id === edgeId);
        if (!edge) return;

        // Store original state for rollback
        const originalEdge = { ...edge };

        // Optimistic UI update - immediately flip in UI
        set({
            edges: edges.map((e) =>
                e.id === edgeId
                    ? {
                        ...e,
                        // Swap source and target
                        source: e.target,
                        target: e.source,
                        // Swap handles for true visual reversal
                        // Original: A (bottom) → B (top) becomes B (top) → A (bottom)
                        sourceHandle: e.targetHandle,
                        targetHandle: e.sourceHandle,
                    }
                    : e
            ),
        });

        // Persist to Neo4j
        try {
            await neo4jReverseRelationship(edgeId);
            console.log('✅ Edge reversal persisted:', edgeId);
        } catch (error) {
            console.error('❌ Edge reversal failed, rolling back:', error);

            // Rollback: Restore original edge
            set({
                edges: get().edges.map((e) =>
                    e.id === edgeId ? originalEdge : e
                ),
                syncError: error instanceof Error ? error.message : 'Failed to reverse relationship',
            });
            useToastStore.getState().addToast('error', 'Failed to reverse edge');
        }
    },

    setEdgeEditing: (edgeId, isEditing) => {
        set({
            edges: get().edges.map((edge) =>
                edge.id === edgeId
                    ? { ...edge, data: { ...edge.data, isEditing } }
                    : edge
            ),
        });
    },

    updateEdgeLabel: (edgeId, label) => {
        // Store original state for rollback
        const originalEdges = get().edges;
        const originalEdge = originalEdges.find(e => e.id === edgeId);
        const originalLabel = originalEdge?.data?.label;

        // V8: Optimistic UI - apply immediately
        set({
            edges: get().edges.map((edge) =>
                edge.id === edgeId
                    ? { ...edge, data: { ...edge.data, label } }
                    : edge
            ),
            isSyncing: true,
        });

        // V8: Sync to Neo4j in background
        neo4jUpdateEdgeLabel(edgeId, label)
            .then(() => {
                console.log('✅ Edge label synced to Neo4j:', edgeId);
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to sync edge label to Neo4j:', error);
                // Rollback: restore original label
                set({
                    edges: get().edges.map((edge) =>
                        edge.id === edgeId
                            ? { ...edge, data: { ...edge.data, label: originalLabel } }
                            : edge
                    ),
                    isSyncing: false,
                    syncError: error instanceof Error ? error.message : 'Failed to update edge label',
                });
                useToastStore.getState().addToast('error', 'Failed to update edge label');
            });
    },

    // V5: Neo4j query execution
    executeNeo4jQuery: async (cypherQuery) => {
        set({ isLoading: true, queryError: null });
        try {
            const result = await neo4jExecuteQuery(cypherQuery);
            // Apply Dagre layout
            const layouted = getLayoutedElements(result.nodes, result.edges);
            set({
                nodes: layouted.nodes,
                edges: layouted.edges,
                isLoading: false,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Query execution failed';
            set({ isLoading: false, queryError: message });
        }
    },

    // V5: Clear canvas
    clearCanvas: () => {
        set({ nodes: [], edges: [], queryError: null });
    },

    // V5: Clear query error
    clearQueryError: () => {
        set({ queryError: null });
    },

    // V8: Check Neo4j connection health
    checkNeo4jConnection: async () => {
        // V9: Check initialization first to avoid throwing
        if (!isDriverInitialized()) {
            set({ isNeo4jConnected: false, syncError: null });
            return;
        }

        try {
            const connected = await neo4jCheckConnection();
            set({ isNeo4jConnected: connected, syncError: null });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Connection check failed';
            set({ isNeo4jConnected: false, syncError: message });
        }
    },

    // V8: Set sync error (for optimistic UI rollback)
    setSyncError: (error) => {
        set({ syncError: error, isSyncing: false });
    },
}));
