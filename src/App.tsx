import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    MiniMap,
    BackgroundVariant,
    MarkerType,
    SelectionMode,
    ConnectionMode,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './store/useGraphStore';
import { useConnectionStore } from './store/useConnectionStore';
import { RectangleNode, CircleNode } from './components/nodes';
import { SmartEdge } from './components/edges';
import { Toolbar } from './components/Toolbar';
import { SearchBar } from './components/SearchBar';
import { QueryPanel } from './components/QueryPanel';
import { ConnectionModal } from './components/ConnectionModal';
import { SettingsModal } from './components/SettingsModal';
import { CanvasHint } from './components/CanvasHint';
import { UnifiedControls } from './components/UnifiedControls';
import { ToastContainer } from './components/ToastContainer';
import { PropertyInspector } from './components/PropertyInspector';
import './App.css';

// Register custom node types
const nodeTypes = {
    rectangle: RectangleNode,
    // V4: Circle node disabled for MVP stability
    // circle: CircleNode,
};

// Register custom edge types
const edgeTypes = {
    custom: SmartEdge,
};

function GraphCanvas({ onSettingsClick }: { onSettingsClick: () => void }) {
    // V3: Track connecting state for magnetic handles
    const [isConnecting, setIsConnecting] = useState(false);
    // V4 Fix: Track the node where the drag originated
    const connectingFromRef = useRef<string | null>(null);

    // V10: Get fitView from React Flow
    const { fitView } = useReactFlow();

    // V2: Use useShallow to prevent re-renders on unrelated state changes
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onReconnect, deleteSelected } =
        useGraphStore(
            useShallow((state) => ({
                nodes: state.nodes,
                edges: state.edges,
                onNodesChange: state.onNodesChange,
                onEdgesChange: state.onEdgesChange,
                onConnect: state.onConnect,
                onReconnect: state.onReconnect,
                deleteSelected: state.deleteSelected,
            }))
        );

    // V10: Dynamic minZoom based on node count
    const dynamicMinZoom = useMemo(() => {
        return Math.min(0.5, 10 / (nodes.length || 1));
    }, [nodes.length]);

    // V13: Fit view only when loading from empty state
    const prevNodeCountRef = useRef(nodes.length);
    useEffect(() => {
        // Only fitView when loading data from an empty canvas
        if (prevNodeCountRef.current === 0 && nodes.length > 0) {
            // Small delay to allow React Flow to render nodes
            const timeout = setTimeout(() => {
                fitView({ padding: 0.2, duration: 300 });
            }, 50);
        }
        prevNodeCountRef.current = nodes.length;
    }, [nodes.length, fitView]);

    // Handle keyboard deletion
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === 'Backspace' || event.key === 'Delete') {
                // Don't delete if typing in an input
                if (
                    event.target instanceof HTMLInputElement ||
                    event.target instanceof HTMLTextAreaElement
                ) {
                    return;
                }

                // Ask for confirmation
                if (window.confirm('Are you sure you want to delete the selected item(s)?')) {
                    deleteSelected();
                }
            }
        },
        [deleteSelected]
    );

    // V3/V4: Magnetic handles - toggle connecting state + track origin
    const handleConnectStart = useCallback(
        (_event: unknown, params: { nodeId: string | null }) => {
            setIsConnecting(true);
            connectingFromRef.current = params.nodeId;
        },
        []
    );

    const handleConnectEnd = useCallback(() => {
        setIsConnecting(false);
        connectingFromRef.current = null;
    }, []);

    // V4 Fix: Wrap onConnect to correct direction based on drag origin
    const handleConnect = useCallback(
        (connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
            const dragOrigin = connectingFromRef.current;

            // DEBUG: Log connection details
            console.log('🔗 handleConnect called:', {
                dragOrigin,
                connection,
                willSwap: dragOrigin && connection.source !== dragOrigin && connection.target === dragOrigin
            });

            // Null check for source and target
            if (!connection.source || !connection.target) {
                console.log('❌ Connection rejected: null source or target');
                return;
            }

            // If the drag started from what React Flow thinks is the "target", swap them
            if (dragOrigin && connection.source !== dragOrigin && connection.target === dragOrigin) {
                // Swap source and target node IDs only
                // IMPORTANT: Do NOT swap handle IDs - they represent physical positions
                // React Flow's path calculation depends on handles staying in their original positions
                const swapped = {
                    source: connection.target,
                    target: connection.source,
                    // Keep handle IDs as-is (don't swap them)
                    sourceHandle: connection.sourceHandle ?? null,
                    targetHandle: connection.targetHandle ?? null,
                };
                console.log('🔄 Swapping direction (keeping handles):', swapped);
                onConnect(swapped);
            } else {
                const normalized = {
                    source: connection.source,
                    target: connection.target,
                    sourceHandle: connection.sourceHandle ?? null,
                    targetHandle: connection.targetHandle ?? null,
                };
                console.log('✅ Passing through:', normalized);
                onConnect(normalized);
            }
        },
        [onConnect]
    );

    return (
        <div
            className={`app-container ${isConnecting ? 'is-connecting' : ''}`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* V12: Graphive title overlay removed for distraction-free studio */}

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{
                    type: 'custom',
                    animated: false,
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 20,
                        height: 20,
                    },
                }}
                edgesReconnectable
                onReconnect={onReconnect}
                fitView
                // V10: Dynamic zoom limits
                minZoom={dynamicMinZoom}
                maxZoom={2}
                // V2 Performance: Only render visible elements
                onlyRenderVisibleElements
                // V2 Selection: Cmd+Drag for box select, default pan
                selectionKeyCode="Meta"
                panOnDrag={true}
                selectionMode={SelectionMode.Partial}
                // V7: Loose connection mode - allow universal connectivity
                connectionMode={ConnectionMode.Loose}
                // V3: Magnetic handles - connect start/end
                onConnectStart={handleConnectStart}
                onConnectEnd={handleConnectEnd}
                // V3: Increased connection radius for magnetic snap feel
                connectionRadius={40}
                // V14: Disable default delete key to handle confirmation manually
                deleteKeyCode={null}
                // V11: Hide React Flow attribution
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} />

                <MiniMap
                    nodeStrokeWidth={3}
                    zoomable
                    pannable
                />
                <Toolbar />
                <SearchBar />
                <QueryPanel />
                {/* V14: Property Inspector (Sidebar) */}
                <PropertyInspector />
                {/* V10: Canvas Hint for empty state */}
                <CanvasHint />

                {/* V12: Unified Control Stack (Bottom-Left) */}
                <UnifiedControls onSettingsClick={onSettingsClick} />
            </ReactFlow>
        </div>
    );
}

function App() {
    // V11: Settings modal state
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // V9: Load stored connection on mount
    const loadFromStorage = useConnectionStore((state) => state.loadFromStorage);
    const isAuthenticated = useConnectionStore((state) => state.isAuthenticated);

    useEffect(() => {
        loadFromStorage();
    }, [loadFromStorage]);

    return (
        <>
            <ReactFlowProvider>
                {/* V9: Connection Modal (shown when not authenticated) */}
                <ConnectionModal />

                {/* V11: Settings Modal (controlled by UnifiedControls) */}
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                />

                {/* Only render canvas when authenticated */}
                {isAuthenticated && (
                    <GraphCanvas onSettingsClick={() => setIsSettingsOpen(true)} />
                )}
            </ReactFlowProvider>

            {/* V13: Toast Notifications */}
            <ToastContainer />
        </>
    );
}

export default App;
