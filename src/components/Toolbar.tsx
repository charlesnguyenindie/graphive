import { Plus, Trash2 } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/useGraphStore';
import './Toolbar.css';

export function Toolbar() {
    const { addNode, deleteSelected, nodes, edges } = useGraphStore();
    const { screenToFlowPosition } = useReactFlow();

    // Check if anything is selected
    const hasSelection =
        nodes.some((node) => node.selected) ||
        edges.some((edge) => edge.selected);

    const handleCreateNode = () => {
        // V4: Spawn at viewport center
        const centerPosition = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        });
        // V4: Always default to rectangle
        addNode('rectangle', centerPosition);
    };

    const handleDelete = () => {
        if (window.confirm('Are you sure you want to delete the selected item(s)?')) {
            deleteSelected();
        }
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
        </div>
    );
}
