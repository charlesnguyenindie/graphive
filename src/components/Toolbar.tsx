import { Plus, Trash2, Eye, EyeOff, Undo2 } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import './Toolbar.css';

export function Toolbar() {
    const {
        addNode,
        setDeleteModalOpen,
        nodes,
        edges,
        showHiddenItems,
        toggleShowHiddenItems,
        restoreSelected
    } = useGraphStore();
    const { screenToFlowPosition } = useReactFlow();

    // Check if anything is selected
    const hasSelection =
        nodes.some((node) => node.selected) ||
        edges.some((edge) => edge.selected);

    // Check if selection contains hidden items
    const hasHiddenSelection =
        nodes.some((node) => node.selected && node.hidden) ||
        edges.some((edge) => edge.selected && edge.hidden);

    const handleCreateNode = () => {
        // V4: Spawn at viewport center
        const centerPosition = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        });
        // V4: Always default to rectangle
        addNode('rectangle', centerPosition);
    };

    // V18: Open delete modal instead of direct confirmation
    const handleDelete = () => {
        setDeleteModalOpen(true);
    };

    return (
        <div className="toolbar">
            {/* V11: Simplified Create Button with + icon */}
            <button
                className="toolbar-button primary"
                onClick={handleCreateNode}
                title="Create Node"
            >
                <Plus size={20} strokeWidth={2.5} />
            </button>

            <div className="toolbar-divider" />

            <button
                className="toolbar-button danger"
                onClick={handleDelete}
                disabled={!hasSelection}
                title="Delete Selected (Backspace)"
            >
                <Trash2 size={18} />
            </button>

            <div className="toolbar-divider" />

            {/* V19: Visibility Controls */}
            {hasHiddenSelection ? (
                <button
                    className="toolbar-button success"
                    onClick={restoreSelected}
                    title="Restore Selected Items"
                >
                    <Undo2 size={18} />
                </button>
            ) : (
                <button
                    className={`toolbar-button ${showHiddenItems ? 'active' : ''}`}
                    onClick={toggleShowHiddenItems}
                    title={showHiddenItems ? "Hide Hidden Items" : "Show Hidden Items"}
                >
                    {showHiddenItems ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
            )}
        </div>
    );
}
