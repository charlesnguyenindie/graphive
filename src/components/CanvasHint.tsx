import { Plus, Play } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import './CanvasHint.css';

export function CanvasHint() {
    const nodeCount = useGraphStore((state) => state.nodes.length);

    // Only show when canvas is empty
    if (nodeCount > 0) return null;

    return (
        <div className="canvas-hint">
            <div className="canvas-hint__content">
                <h2 className="canvas-hint__title">Get Started</h2>
                <p className="canvas-hint__text">
                    Create a node or run a Cypher query to begin
                </p>
                <div className="canvas-hint__shortcuts">
                    <span className="canvas-hint__shortcut">
                        <Plus size={16} className="canvas-hint__icon" /> Add Node
                    </span>
                    <span className="canvas-hint__shortcut">
                        <Play size={14} className="canvas-hint__icon" /> Run Query
                    </span>
                </div>
            </div>
        </div>
    );
}
