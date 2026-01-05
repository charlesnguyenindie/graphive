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
    const commitDraftEdge = useGraphStore((state) => state.commitDraftEdge);
    const discardDraftEdge = useGraphStore((state) => state.discardDraftEdge);

    const edgeData = data as EdgeData | undefined;
    const label = edgeData?.label ?? '';
    const isEditing = edgeData?.isEditing ?? false;
    const isDraft = edgeData?.isDraft ?? false;

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

    // V20: Commit or Discard logic
    const handleSave = useCallback(() => {
        const trimmed = editValue.trim();

        if (isDraft) {
            // Draft Mode: Commit if has value, Discard if empty/cancelled (on blur)
            // Wait, on blur we generally want to commit if they typed something.
            // If they clicked away without typing, maybe keep draft? 
            // Or discard? Node logic discards empty drafts.
            if (trimmed) {
                commitDraftEdge(id, trimmed);
            } else {
                discardDraftEdge(id);
            }
        } else {
            // Edit Mode: Update only if value exists (don't clear label to empty string unintentionally, or allow it?)
            if (trimmed) {
                updateEdgeLabel(id, trimmed);
            }
            setEdgeEditing(id, false);
        }
    }, [id, editValue, isDraft, commitDraftEdge, discardDraftEdge, updateEdgeLabel, setEdgeEditing]);

    const handleCancel = useCallback(() => {
        if (isDraft) {
            discardDraftEdge(id);
        } else {
            setEdgeEditing(id, false);
        }
    }, [isDraft, id, discardDraftEdge, setEdgeEditing]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    }, [handleSave, handleCancel]);

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
                className={`${selected ? 'smart-edge selected' : 'smart-edge'} ${isDraft ? 'draft' : ''}`}
                style={isDraft ? { strokeDasharray: '5,5', stroke: '#f59e0b' } : undefined} // V20: Amber dashed for draft
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
                            placeholder={isDraft ? "Type..." : undefined}
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
