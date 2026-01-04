import { useState, useRef, useEffect, useCallback } from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
} from '@xyflow/react';
import { ArrowLeftRight } from 'lucide-react';
import { useGraphStore, EdgeData } from '../../store/useGraphStore';
import './edges.css';

/**
 * SmartEdge - Feature-rich edge with flip, reconnect, and inline editing
 */
export function SmartEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
}: EdgeProps) {
    const flipEdge = useGraphStore((state) => state.flipEdge);
    const setEdgeEditing = useGraphStore((state) => state.setEdgeEditing);
    const updateEdgeLabel = useGraphStore((state) => state.updateEdgeLabel);

    const edgeData = data as EdgeData | undefined;
    const label = edgeData?.label ?? '';
    const isEditing = edgeData?.isEditing ?? false;

    // Local editing state
    const [editValue, setEditValue] = useState(label);
    const inputRef = useRef<HTMLInputElement>(null);

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Double-click to edit
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(label);
        setEdgeEditing(id, true);
    }, [id, label, setEdgeEditing]);

    // Save on Enter or blur
    const handleSave = useCallback(() => {
        updateEdgeLabel(id, editValue.trim());
        setEdgeEditing(id, false);
    }, [id, editValue, updateEdgeLabel, setEdgeEditing]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEdgeEditing(id, false);
        }
    }, [handleSave, id, setEdgeEditing]);

    // Flip edge direction
    const handleFlip = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        flipEdge(id);
    }, [id, flipEdge]);

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                className={selected ? 'smart-edge selected' : 'smart-edge'}
            />
            <EdgeLabelRenderer>
                <div
                    className={`edge-label-container ${selected ? 'selected' : ''}`}
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                >
                    {/* Flip Button - only visible when selected */}
                    {selected && (
                        <button
                            className="edge-flip-button"
                            onClick={handleFlip}
                            title="Flip edge direction"
                        >
                            <ArrowLeftRight size={12} />
                        </button>
                    )}

                    {/* Label or Input */}
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            className="edge-edit-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            style={{ width: `${Math.max(editValue.length * 8, 60)}px` }}
                        />
                    ) : (
                        <div
                            className="edge-label"
                            onDoubleClick={handleDoubleClick}
                        >
                            {label || (selected ? 'Double-click to add label' : '')}
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
}
