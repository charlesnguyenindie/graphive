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
    isAdapterInitialized as isDriverInitialized,
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
    // V14: Property & Label CRUD
    updateNodeProperty as neo4jUpdateProperty,
    deleteNodeProperty as neo4jDeleteProperty,
    addNodeLabel as neo4jAddLabel,
    removeNodeLabel as neo4jRemoveLabel,
    expandNeighbors as neo4jExpandNeighbors,
    // V15: Dashboard
    getDashboards as neo4jGetDashboards,
    getDashboard as neo4jGetDashboard,
    saveDashboard as neo4jSaveDashboard,
    deleteDashboard as neo4jDeleteDashboard,
    saveDashboardsOrder as neo4jSaveDashboardsOrder,
    renameDashboard as neo4jRenameDashboard,
} from '../services/database';
import { DashboardMeta } from '../services/database/types';
import { getLayoutedElements } from '../services/layoutService';
import { useToastStore } from './useToastStore';

export interface NodeData {
    label?: string;
    collapsed?: boolean;
    isEditing?: boolean;
    isDraft?: boolean;  // V13: Draft nodes not yet persisted
    [key: string]: unknown;
}

export interface EdgeData {
    label?: string;
    isEditing?: boolean;
    isDraft?: boolean; // V20: Draft edges not yet persisted
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
    // V18: Smart Delete - renamed for clarity
    deleteSelected: () => void;  // Legacy alias for deleteSelectedFromDB
    deleteSelectedFromDB: () => void;  // Deletes from UI AND Neo4j
    removeSelectedFromUI: () => void;  // Removes from UI only (no DB sync)
    isDeleteModalOpen: boolean;
    setDeleteModalOpen: (isOpen: boolean) => void;
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
    // V20: Edge Drafting
    commitDraftEdge: (edgeId: string, label: string) => Promise<void>;
    discardDraftEdge: (edgeId: string) => void;
    // V5: Neo4j actions
    // V17: Added additive parameter to merge results instead of replacing
    executeNeo4jQuery: (cypherQuery: string, additive?: boolean) => Promise<void>;
    clearCanvas: () => void;
    clearQueryError: () => void;
    // V8: Sync actions
    checkNeo4jConnection: () => Promise<void>;
    setSyncError: (error: string | null) => void;
    // V14: Property & Label CRUD
    updateNodeProperty: (nodeId: string, key: string, value: unknown) => void;
    deleteNodeProperty: (nodeId: string, key: string) => void;
    addNodeProperty: (nodeId: string, key: string, value: unknown) => void;
    addLabel: (nodeId: string, label: string) => void;
    removeLabel: (nodeId: string, label: string) => void;
    expandNeighbors: (nodeId: string) => void;
    setNodeDisplayKey: (nodeId: string, key: string | null) => void;
    // V15: Dashboard
    activeDashboardId: string | null;
    dashboardName: string;
    isDashboardDirty: boolean;
    loadDashboard: (id: string) => Promise<void>;
    saveDashboard: () => Promise<void>;
    setIsDashboardDirty: (dirty: boolean) => void;
    setDashboardName: (name: string) => void;
    setCypherQuery: (query: string) => void;
    cypherQuery: string;
    // Internal flag to suppress dirty checks during load
    isRestoring: boolean;
    initializeGraph: () => Promise<void>;
    createDashboardAsCopy: (name: string) => Promise<void>;
    reorderDashboards: (ids: string[]) => Promise<void>;
    renameDashboard: (id: string, name: string) => Promise<void>;
    // V19: Visibility Manager
    showHiddenItems: boolean;
    setShowHiddenItems: (show: boolean) => void;
    toggleShowHiddenItems: () => void;
    restoreSelected: () => void; // Unhides selected items (useful when showHiddenItems is true)
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
    // V15: Dashboard state
    activeDashboardId: null,
    dashboardName: 'Untitled',
    isDashboardDirty: false,
    cypherQuery: 'MATCH (n)\nOPTIONAL MATCH (n)-[r]-()\nRETURN n, r',
    isRestoring: false,
    // V18: Smart Delete modal state
    isDeleteModalOpen: false,
    // V19: Visibility Manager
    showHiddenItems: false,

    onNodesChange: (changes) => {
        // V15: Detect position or dimension changes for dirty tracking
        const hasLayoutChange = changes.some(
            (c) => (c.type === 'position' && c.position) || c.type === 'dimensions'
        );

        const newNodes = applyNodeChanges(changes, get().nodes);

        set({
            nodes: newNodes,
            // Mark dirty if layout changed AND not restoring
            ...((hasLayoutChange && !get().isRestoring) ? { isDashboardDirty: true } : {}),
        });

        // V15: Auto-save to LocalStorage on layout changes (debounced)
        if (hasLayoutChange && !get().isRestoring) {
            const { dashboardName, cypherQuery, activeDashboardId } = get();
            const layout: Record<string, { x: number; y: number; w?: number; h?: number }> = {};

            for (const node of newNodes) {
                // Get dimensions
                const w = node.measured?.width ?? node.width ?? (typeof node.style?.width === 'number' ? node.style.width : undefined);
                const h = node.measured?.height ?? node.height ?? (typeof node.style?.height === 'number' ? node.style.height : undefined);

                layout[node.id] = {
                    x: node.position.x,
                    y: node.position.y,
                    w,
                    h
                };
            }

            try {
                localStorage.setItem('graphive_session', JSON.stringify({
                    activeDashboardId,
                    dashboardName,
                    cypherQuery,
                    layout,
                    savedAt: new Date().toISOString(),
                }));
                console.log('💾 Auto-saved to LocalStorage');
            } catch (e) {
                console.warn('Failed to save to LocalStorage:', e);
            }
        }
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
            data: {
                label: '', // V13: Empty default label
                isDraft: true, // V20: Start as draft
                isEditing: true // V20: Auto-focus input
            },
        };

        console.log('📥 Store onConnect (Draft):', { connection, newEdge });

        // V20: Add local draft edge only - do NOT sync to Neo4j yet
        set({
            edges: addEdge(newEdge as Edge, get().edges),
        });
    },

    // V20: Commit draft edge -> Sync to Neo4j
    commitDraftEdge: async (edgeId: string, label: string) => {
        const { edges } = get();
        const edge = edges.find(e => e.id === edgeId);
        if (!edge) return;

        console.log('💾 Committing draft edge:', { edgeId, label });
        set({ isSyncing: true, syncError: null });

        try {
            // Default label if empty
            const finalLabel = label.trim() || 'LINK';

            // Sync to Neo4j
            await neo4jCreateEdge(edgeId, edge.source, edge.target, finalLabel);
            console.log('✅ Edge synced to Neo4j:', edgeId);

            // Update store: remove draft status, set final label
            set({
                edges: edges.map(e => e.id === edgeId ? {
                    ...e,
                    data: { ...e.data, isDraft: false, isEditing: false, label: finalLabel }
                } : e),
                isSyncing: false
            });
            useToastStore.getState().addToast('success', 'Connection saved');
        } catch (error) {
            console.error('❌ Failed to commit edge:', error);
            set({
                isSyncing: false,
                syncError: error instanceof Error ? error.message : 'Failed to save connection'
            });
            useToastStore.getState().addToast('error', 'Failed to save connection');
            // We do NOT remove the edge, giving user chance to retry? 
            // Or maybe we should keep it in draft mode?
            // Current user request implies "disappear on reload" bug was due to lack of sync.
            // If sync fails, we should probably let them try again.
        }
    },

    // V20: Discard draft edge -> Remove from store
    discardDraftEdge: (edgeId: string) => {
        set({
            edges: get().edges.filter(e => e.id !== edgeId)
        });
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
                    ? { ...n, data: { ...n.data, label, name: label, isEditing: false, isDraft: false } }
                    : n
            ),
            isSyncing: true,
        });

        try {
            // V14: Create node and get persistent ID (Element ID)
            const newId = await neo4jCreateNode(label);
            console.log('✅ Draft node committed to Neo4j:', { tempId: nodeId, newId });

            set({
                isSyncing: false,
                // Replace temp ID with persistent ID
                nodes: get().nodes.map(n =>
                    n.id === nodeId
                        ? {
                            ...n,
                            id: newId,
                            data: { ...n.data, _elementId: newId }
                        }
                        : n
                ),
                // Also update any edges connected to this node
                edges: get().edges.map(e => ({
                    ...e,
                    source: e.source === nodeId ? newId : e.source,
                    target: e.target === nodeId ? newId : e.target,
                }))
            });

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
        const originalName = originalNode?.data.name; // Capture original name

        // V8: Optimistic UI - apply immediately
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, label, name: label } } : node
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
                // Rollback: restore original label and name
                set({
                    nodes: get().nodes.map((node) =>
                        node.id === id ? { ...node, data: { ...node.data, label: originalLabel ?? label, name: originalName } } : node
                    ),
                    isSyncing: false,
                    syncError: error instanceof Error ? error.message : 'Failed to update node name',
                });

                // V14: Better error message for unique constraints
                const errorMessage = error instanceof Error ? error.message : '';
                if (errorMessage.includes('already exists') || errorMessage.includes('ConstraintValidationFailed')) {
                    useToastStore.getState().addToast('error', `Name '${label}' is already taken`);
                } else {
                    useToastStore.getState().addToast('error', 'Failed to update node name');
                }
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

    // V18: Smart Delete - UI-only removal (Soft Hide for V19)
    removeSelectedFromUI: () => {
        const { nodes, edges } = get();

        // V19: Set hidden=true instead of removing
        const newNodes = nodes.map((node) =>
            node.selected
                ? { ...node, hidden: true, selected: false }
                : node
        );

        const newEdges = edges.map((edge) =>
            edge.selected
                ? { ...edge, hidden: true, selected: false }
                : edge
        );

        set({ nodes: newNodes, edges: newEdges, isDeleteModalOpen: false });
        useToastStore.getState().addToast('info', 'Hidden from view. Enable "Show Hidden" to restore.');
    },

    // V19: Visibility Manager Actions
    setShowHiddenItems: (show) => set({ showHiddenItems: show }),

    toggleShowHiddenItems: () => set((state) => ({ showHiddenItems: !state.showHiddenItems })),

    restoreSelected: () => {
        const { nodes, edges } = get();

        const newNodes = nodes.map((node) =>
            node.selected && node.hidden
                ? { ...node, hidden: false, selected: false }
                : node
        );

        const newEdges = edges.map((edge) =>
            edge.selected && edge.hidden
                ? { ...edge, hidden: false, selected: false }
                : edge
        );

        set({ nodes: newNodes, edges: newEdges });
        useToastStore.getState().addToast('success', 'Restored items to view');
    },

    // V18: Smart Delete - Delete from BOTH UI and DB (renamed from deleteSelected)
    deleteSelectedFromDB: () => {
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
        set({ nodes: remainingNodes, edges: remainingEdges, isSyncing: true, isDeleteModalOpen: false });

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

    // V18: Backward compatible alias
    deleteSelected: () => {
        get().deleteSelectedFromDB();
    },

    // V18: Modal control
    setDeleteModalOpen: (isOpen) => {
        set({ isDeleteModalOpen: isOpen });
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
    // V17: Added additive mode to merge results with existing nodes
    executeNeo4jQuery: async (cypherQuery, additive = false) => {
        set({ isLoading: true, queryError: null });
        try {
            const result = await neo4jExecuteQuery(cypherQuery);

            if (additive) {
                // V17: Merge mode - add to existing nodes/edges
                const currentNodes = get().nodes;
                const currentEdges = get().edges;

                // Deduplicate nodes by ID
                const existingNodeIds = new Set(currentNodes.map(n => n.id));
                const newNodes = result.nodes.filter(n => !existingNodeIds.has(n.id));

                // Deduplicate edges by ID
                const existingEdgeIds = new Set(currentEdges.map(e => e.id));
                const newEdges = result.edges.filter(e => !existingEdgeIds.has(e.id));

                if (newNodes.length > 0 || newEdges.length > 0) {
                    let finalNewNodes = newNodes;
                    let finalNewEdges = newEdges;

                    // Only run layout if we have new nodes to position
                    if (newNodes.length > 0) {
                        const layoutedNew = getLayoutedElements(newNodes, newEdges);

                        // Offset new nodes to avoid overlap with existing
                        const maxX = currentNodes.length > 0
                            ? Math.max(...currentNodes.map(n => n.position.x)) + 300
                            : 0;

                        finalNewNodes = layoutedNew.nodes.map(n => ({
                            ...n,
                            position: { x: n.position.x + maxX, y: n.position.y }
                        }));
                        finalNewEdges = layoutedNew.edges;
                    }

                    set({
                        nodes: [...currentNodes, ...finalNewNodes],
                        edges: [...currentEdges, ...finalNewEdges],
                        isLoading: false,
                    });
                } else {
                    // No new data
                    set({ isLoading: false });
                }
            } else {
                // Original behavior: replace all
                const layouted = getLayoutedElements(result.nodes, result.edges);
                set({
                    nodes: layouted.nodes,
                    edges: layouted.edges,
                    isLoading: false,
                });
            }
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

    // ============================================================
    // V14: Property & Label CRUD with Optimistic UI
    // ============================================================

    updateNodeProperty: (nodeId, key, value) => {
        const originalNodes = get().nodes;
        const originalNode = originalNodes.find(n => n.id === nodeId);
        const originalValue = originalNode?.data[key];

        // Optimistic UI: Update immediately
        set({
            nodes: get().nodes.map(node =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, [key]: value } }
                    : node
            ),
            isSyncing: true,
        });

        // Sync to Neo4j
        neo4jUpdateProperty(nodeId, key, value)
            .then(() => {
                console.log('✅ Property updated:', { nodeId, key, value });
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to update property:', error);
                // Rollback
                set({
                    nodes: get().nodes.map(node =>
                        node.id === nodeId
                            ? { ...node, data: { ...node.data, [key]: originalValue } }
                            : node
                    ),
                    isSyncing: false,
                });

                // V14: Better error message for unique constraints
                const errorMessage = error instanceof Error ? error.message : '';
                if (errorMessage.includes('already exists') || errorMessage.includes('ConstraintValidationFailed')) {
                    useToastStore.getState().addToast('error', `Value for '${key}' is already taken`);
                } else {
                    useToastStore.getState().addToast('error', 'Failed to update property');
                }
            });
    },

    deleteNodeProperty: (nodeId, key) => {
        const originalNodes = get().nodes;
        const originalNode = originalNodes.find(n => n.id === nodeId);
        const originalValue = originalNode?.data[key];

        // Optimistic UI: Remove the property
        set({
            nodes: get().nodes.map(node => {
                if (node.id !== nodeId) return node;
                const { [key]: _, ...restData } = node.data;
                return { ...node, data: restData as NodeData };
            }),
            isSyncing: true,
        });

        // Sync to Neo4j
        neo4jDeleteProperty(nodeId, key)
            .then(() => {
                console.log('✅ Property deleted:', { nodeId, key });
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to delete property:', error);
                // Rollback: restore the property
                set({
                    nodes: get().nodes.map(node =>
                        node.id === nodeId
                            ? { ...node, data: { ...node.data, [key]: originalValue } }
                            : node
                    ),
                    isSyncing: false,
                });
                useToastStore.getState().addToast('error', 'Failed to delete property');
            });
    },

    addNodeProperty: (nodeId, key, value) => {
        // addNodeProperty is functionally the same as updateNodeProperty (SET creates if not exists)
        get().updateNodeProperty(nodeId, key, value);
    },

    addLabel: (nodeId, label) => {
        const originalNodes = get().nodes;
        const originalNode = originalNodes.find(n => n.id === nodeId);
        const originalLabels = (originalNode?.data._labels as string[]) || [];

        // Optimistic UI: Add label to _labels array
        set({
            nodes: get().nodes.map(node => {
                if (node.id !== nodeId) return node;
                const currentLabels = (node.data._labels as string[]) || [];
                if (currentLabels.includes(label)) return node; // Already exists
                return {
                    ...node,
                    data: { ...node.data, _labels: [...currentLabels, label] }
                };
            }),
            isSyncing: true,
        });

        // Sync to Neo4j
        neo4jAddLabel(nodeId, label)
            .then(() => {
                console.log('✅ Label added:', { nodeId, label });
                set({ isSyncing: false });
                useToastStore.getState().addToast('success', `Label "${label}" added`);
            })
            .catch((error) => {
                console.error('❌ Failed to add label:', error);
                // Rollback
                set({
                    nodes: get().nodes.map(node =>
                        node.id === nodeId
                            ? { ...node, data: { ...node.data, _labels: originalLabels } }
                            : node
                    ),
                    isSyncing: false,
                });
                useToastStore.getState().addToast('error', 'Failed to add label');
            });
    },

    removeLabel: (nodeId, label) => {
        const originalNodes = get().nodes;
        const originalNode = originalNodes.find(n => n.id === nodeId);
        const originalLabels = (originalNode?.data._labels as string[]) || [];

        // Optimistic UI: Remove label from _labels array
        set({
            nodes: get().nodes.map(node => {
                if (node.id !== nodeId) return node;
                const currentLabels = (node.data._labels as string[]) || [];
                return {
                    ...node,
                    data: { ...node.data, _labels: currentLabels.filter(l => l !== label) }
                };
            }),
            isSyncing: true,
        });

        // Sync to Neo4j
        neo4jRemoveLabel(nodeId, label)
            .then(() => {
                console.log('✅ Label removed:', { nodeId, label });
                set({ isSyncing: false });
            })
            .catch((error) => {
                console.error('❌ Failed to remove label:', error);
                // Rollback
                set({
                    nodes: get().nodes.map(node =>
                        node.id === nodeId
                            ? { ...node, data: { ...node.data, _labels: originalLabels } }
                            : node
                    ),
                    isSyncing: false,
                });
                useToastStore.getState().addToast('error', 'Failed to remove label');
            });
    },

    expandNeighbors: (nodeId) => {
        set({ isLoading: true });

        neo4jExpandNeighbors(nodeId)
            .then((result) => {
                const currentNodes = get().nodes;
                const currentEdges = get().edges;

                // Merge new nodes (avoid duplicates)
                const existingNodeIds = new Set(currentNodes.map(n => n.id));
                const newNodes = result.nodes.filter(n => !existingNodeIds.has(n.id));

                // Merge new edges (avoid duplicates)
                const existingEdgeIds = new Set(currentEdges.map(e => e.id));
                const newEdges = result.edges.filter(e => !existingEdgeIds.has(e.id));

                // Apply layout to position new nodes
                if (newNodes.length > 0) {
                    const allNodes = [...currentNodes, ...newNodes];
                    const allEdges = [...currentEdges, ...newEdges];
                    const layouted = getLayoutedElements(allNodes, allEdges);

                    set({
                        nodes: layouted.nodes,
                        edges: layouted.edges,
                        isLoading: false,
                    });

                    useToastStore.getState().addToast(
                        'success',
                        `Found ${newNodes.length} new node${newNodes.length !== 1 ? 's' : ''}`
                    );
                } else {
                    set({ isLoading: false });
                    useToastStore.getState().addToast('info', 'No additional neighbors found');
                }
            })
            .catch((error) => {
                console.error('❌ Failed to expand neighbors:', error);
                set({ isLoading: false });
                useToastStore.getState().addToast('error', 'Failed to expand neighbors');
            });
    },

    // V14: Set which property key to display on a node (client-side only)
    setNodeDisplayKey: (nodeId, key) => {
        set({
            nodes: get().nodes.map(node =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, _displayKey: key } }
                    : node
            ),
        });
        console.log('🏷️ Display key set:', { nodeId, key });
    },

    // V15: Dashboard actions
    setIsDashboardDirty: (dirty) => {
        set({ isDashboardDirty: dirty });
    },

    setDashboardName: (name) => {
        set({ dashboardName: name, isDashboardDirty: true });
    },

    setCypherQuery: (query) => {
        set({ cypherQuery: query });
    },

    loadDashboard: async (id) => {
        set({ isRestoring: true, isLoading: true });

        try {
            const dashboard = await neo4jGetDashboard(id);
            if (!dashboard) {
                useToastStore.getState().addToast('error', 'Dashboard not found');
                set({ isLoading: false });
                return;
            }

            // Parse layout
            let nodesLayout: Record<string, { x?: number; y?: number; w?: number; h?: number; hidden?: boolean }> = {};
            let edgesLayout: Record<string, { sourceHandle?: string | null; targetHandle?: string | null; hidden?: boolean }> = {};

            try {
                const parsed = JSON.parse(dashboard.layout);
                // Handle legacy format (if any) or new format
                nodesLayout = parsed.nodes || {};
                edgesLayout = parsed.edges || {};
            } catch { /* empty layout */ }

            // Set dashboard metadata
            set({
                activeDashboardId: id,
                dashboardName: dashboard.name,
                cypherQuery: dashboard.query,
                isDashboardDirty: false,
            });

            // Execute the query
            const result = await neo4jExecuteQuery(dashboard.query);
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                result.nodes,
                result.edges
            );

            // Apply saved positions and dimensions from layout
            const nodesWithLayout = layoutedNodes.map(node => {
                const saved = nodesLayout[node.id];
                if (saved) {
                    return {
                        ...node,
                        position: {
                            x: saved.x ?? node.position.x,
                            y: saved.y ?? node.position.y
                        },
                        // V15 Fix: Restore dimensions
                        width: saved.w,
                        height: saved.h,
                        hidden: saved.hidden, // V23: Restore hidden state
                        style: {
                            ...node.style,
                            width: saved.w,
                            height: saved.h,
                        },
                    };
                }
                return node;
            });

            // V22: Restore edge handles from layout
            const edgesWithLayout = layoutedEdges.map(edge => {
                const saved = edgesLayout[edge.id];
                if (saved) {
                    return {
                        ...edge,
                        sourceHandle: saved.sourceHandle ?? edge.sourceHandle,
                        targetHandle: saved.targetHandle ?? edge.targetHandle,
                        hidden: saved.hidden, // V23: Restore hidden state
                    };
                }
                return edge;
            });

            set({
                nodes: nodesWithLayout,
                edges: edgesWithLayout, // V22 Use edges with restored handles
                isLoading: false,
                isDashboardDirty: false,
                // Keep isRestoring true slightly longer to ignore initial measurement events
                isRestoring: true,
            });

            setTimeout(() => {
                set({ isRestoring: false });
            }, 500);

            console.log('📊 Dashboard loaded:', dashboard.name);
            useToastStore.getState().addToast('success', `Dashboard "${dashboard.name}" loaded`);
        } catch (error) {
            console.error('❌ Failed to load dashboard:', error);
            set({ isLoading: false });
            useToastStore.getState().addToast('error', 'Failed to load dashboard');
        }
    },

    saveDashboard: async () => {
        const { activeDashboardId, dashboardName, cypherQuery, nodes, edges } = get();

        // Build layout object from current node positions/dimensions AND edge handles (V22)
        const layout: {
            nodes: Record<string, { x: number; y: number; w?: number; h?: number; hidden?: boolean }>;
            edges: Record<string, { sourceHandle?: string | null; targetHandle?: string | null; hidden?: boolean }>;
        } = { nodes: {}, edges: {} };

        for (const node of nodes) {
            // Get dimensions from measured (actual rendered size) or style/props
            const w = node.measured?.width ?? node.width ?? (typeof node.style?.width === 'number' ? node.style.width : undefined);
            const h = node.measured?.height ?? node.height ?? (typeof node.style?.height === 'number' ? node.style.height : undefined);

            layout.nodes[node.id] = {
                x: node.position.x,
                y: node.position.y,
                w,
                h,
                hidden: node.hidden, // V23
            };
        }

        // V22: Save edge handles
        for (const edge of edges) {
            // V23: Save hidden state for all edges, or handles if present
            if (edge.sourceHandle || edge.targetHandle || edge.hidden) {
                layout.edges[edge.id] = {
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                    hidden: edge.hidden // V23
                };
            }
        }

        set({ isSyncing: true });

        try {
            const newId = await neo4jSaveDashboard(
                activeDashboardId,
                dashboardName,
                cypherQuery,
                JSON.stringify(layout)
            );

            set({
                activeDashboardId: newId,
                dashboardName: dashboardName, // Explicitly set name to ensure sync
                isDashboardDirty: false,
                isSyncing: false,
            });

            console.log('💾 Dashboard saved:', dashboardName);
            useToastStore.getState().addToast('success', `Dashboard "${dashboardName}" saved`);
        } catch (error) {
            console.error('❌ Failed to save dashboard:', error);
            set({ isSyncing: false });
            useToastStore.getState().addToast('error', 'Failed to save dashboard');
        }
    },

    createDashboardAsCopy: async (name: string) => {
        const { cypherQuery, nodes, edges } = get();

        // Build layout
        const layout: {
            nodes: Record<string, { x: number; y: number; w?: number; h?: number; hidden?: boolean }>;
            edges: Record<string, { sourceHandle?: string | null; targetHandle?: string | null; hidden?: boolean }>;
        } = { nodes: {}, edges: {} };

        for (const node of nodes) {
            const w = node.measured?.width ?? node.width ?? (typeof node.style?.width === 'number' ? node.style.width : undefined);
            const h = node.measured?.height ?? node.height ?? (typeof node.style?.height === 'number' ? node.style.height : undefined);
            layout.nodes[node.id] = { x: node.position.x, y: node.position.y, w, h, hidden: node.hidden };
        }

        // V22: Copy edge handles
        for (const edge of edges) {
            if (edge.sourceHandle || edge.targetHandle || edge.hidden) {
                layout.edges[edge.id] = {
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                    hidden: edge.hidden
                };
            }
        }

        set({ isSyncing: true });

        try {
            // Save as new (null ID)
            const newId = await neo4jSaveDashboard(null, name, cypherQuery, JSON.stringify(layout));

            set({
                activeDashboardId: newId,
                dashboardName: name,
                isDashboardDirty: false,
                isSyncing: false,
                isRestoring: true // Prevent dirty flag from immediate render
            });

            setTimeout(() => set({ isRestoring: false }), 500);

            console.log('📋 Dashboard copied:', name);
            useToastStore.getState().addToast('success', 'Created new dashboard');
        } catch (error) {
            console.error('❌ Failed to create copy:', error);
            set({ isSyncing: false });
            useToastStore.getState().addToast('error', 'Failed to create dashboard');
        }
    },

    reorderDashboards: async (ids: string[]) => {
        // Optimistic update handled by UI/Parent, store just syncs
        try {
            await neo4jSaveDashboardsOrder(ids);
            console.log('🔢 Dashboard order saved');
        } catch (error) {
            console.error('❌ Failed to save order:', error);
            useToastStore.getState().addToast('error', 'Failed to save order');
        }
    },

    renameDashboard: async (id: string, name: string) => {
        try {
            await neo4jRenameDashboard(id, name);

            // If renaming active dashboard, update local state
            const currentActive = get().activeDashboardId;
            console.log('Renaming:', id, 'Active:', currentActive, 'Match:', currentActive === id);

            if (currentActive === id) {
                set({ dashboardName: name });

                // V15.1 Fix: Update LocalStorage session immediately with new name
                try {
                    const { cypherQuery, nodes } = get();
                    const layout: Record<string, { x: number; y: number; w?: number; h?: number }> = {};
                    for (const node of nodes) {
                        const w = node.measured?.width ?? node.width ?? (typeof node.style?.width === 'number' ? node.style.width : undefined);
                        const h = node.measured?.height ?? node.height ?? (typeof node.style?.height === 'number' ? node.style.height : undefined);
                        layout[node.id] = { x: node.position.x, y: node.position.y, w, h };
                    }

                    localStorage.setItem('graphive_session', JSON.stringify({
                        activeDashboardId: id,
                        dashboardName: name,
                        cypherQuery,
                        layout,
                        savedAt: new Date().toISOString(),
                    }));
                } catch (e) {
                    console.warn('Failed to update session on rename:', e);
                }
            }

            useToastStore.getState().addToast('success', 'Dashboard renamed');
        } catch (error) {
            console.error('❌ Failed to rename dashboard:', error);
            useToastStore.getState().addToast('error', 'Failed to rename dashboard');
        }
    },

    initializeGraph: async () => {
        console.log('🚀 initializeGraph called, nodes:', get().nodes.length);
        if (get().nodes.length > 0) {
            console.log('Already has content, skipping');
            return;
        }

        set({ isRestoring: true, isLoading: true });

        // Priority 1: Check Neo4j for saved dashboards
        console.log('📊 Checking Neo4j for saved dashboards...');
        try {
            const list = await neo4jGetDashboards();
            console.log('Found', list.length, 'dashboards');

            if (list.length > 0) {
                // Load the first dashboard (by order)
                console.log('Loading first dashboard:', list[0].id, list[0].name);

                // Clear stale LocalStorage since we're loading fresh from Neo4j
                localStorage.removeItem('graphive_session');

                await get().loadDashboard(list[0].id);
                return;
            }
        } catch (e) {
            console.error('Failed to fetch dashboards from Neo4j:', e);
        }

        // Priority 2: No saved dashboards - try LocalStorage (unsaved work)
        console.log('📦 No dashboards in Neo4j, checking LocalStorage...');
        const savedSession = localStorage.getItem('graphive_session');

        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                console.log('Session data:', {
                    activeDashboardId: session.activeDashboardId,
                    hasLayout: !!session.layout,
                    dashboardName: session.dashboardName
                });

                if (session.cypherQuery && session.layout) {
                    const { activeDashboardId, dashboardName, cypherQuery, layout } = session;

                    const result = await neo4jExecuteQuery(cypherQuery);
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(result.nodes, result.edges);

                    const nodesWithLayout = layoutedNodes.map(node => {
                        const saved = layout[node.id];
                        if (saved) {
                            return {
                                ...node,
                                position: {
                                    x: saved.x ?? node.position.x,
                                    y: saved.y ?? node.position.y
                                },
                                width: saved.w,
                                height: saved.h,
                                style: { ...node.style, width: saved.w, height: saved.h },
                            };
                        }
                        return node;
                    });

                    set({
                        activeDashboardId: activeDashboardId || null,
                        dashboardName: dashboardName || 'Untitled',
                        cypherQuery,
                        nodes: nodesWithLayout,
                        edges: layoutedEdges,
                        isLoading: false,
                        isDashboardDirty: true,
                        isRestoring: false,
                    });

                    console.log('💾 Restored unsaved session from LocalStorage');
                    return;
                }
            } catch (e) {
                console.warn('Invalid LocalStorage session', e);
            }
        }

        // Priority 3: Empty canvas
        console.log('No dashboards or session found, showing empty canvas');
        set({ isLoading: false, isRestoring: false });
    },
}));
