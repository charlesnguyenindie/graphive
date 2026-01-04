import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { Minus, Plus } from 'lucide-react';
import { useGraphStore, NodeData } from '../../store/useGraphStore';
import './nodes.css';

/**
 * RectangleNode - V13 with Draft Support
 * Features: 4 handles, inline editing, smart collapse button, resizable, draft commit/discard
 * Performance: Deep memoization ignoring position changes
 */
function RectangleNodeComponent({ id, data, selected, width, height }: NodeProps) {
    // V13: Added draft commit/discard actions
    const { toggleCollapse, updateNodeLabel, setNodeEditing, commitDraftNode, discardDraftNode, highlightedNodeId, edges } =
        useGraphStore(
            useShallow((state) => ({
                toggleCollapse: state.toggleCollapse,
                updateNodeLabel: state.updateNodeLabel,
                setNodeEditing: state.setNodeEditing,
                commitDraftNode: state.commitDraftNode,
                discardDraftNode: state.discardDraftNode,
                highlightedNodeId: state.highlightedNodeId,
                edges: state.edges,
            }))
        );

    const nodeData = data as NodeData;
    const isCollapsed = nodeData.collapsed ?? false;
    const isEditing = nodeData.isEditing ?? false;
    const isDraft = nodeData.isDraft ?? false;
    const isHighlighted = highlightedNodeId === id;

    // Smart button: only show if this node has outgoing edges
    const hasOutgoingEdges = edges.some((e) => e.source === id);

    // Local state for editing
    const [editValue, setEditValue] = useState(nodeData.label);
    // V13: Track if initial select has been done
    const [hasInitialSelect, setHasInitialSelect] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when entering edit mode (especially for new draft nodes)
    useEffect(() => {
        if (isEditing && inputRef.current) {
            // Use requestAnimationFrame to ensure focus happens after React Flow renders
            requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    // V13: Only select all on initial focus, not on subsequent clicks
                    if (!hasInitialSelect) {
                        inputRef.current.select();
                        setHasInitialSelect(true);
                    }
                }
            });
        }
    }, [isEditing, hasInitialSelect]);

    // Reset initial select state when exiting edit mode
    useEffect(() => {
        if (!isEditing) {
            setHasInitialSelect(false);
        }
    }, [isEditing]);

    // Double-click to enter edit mode
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(nodeData.label);
        setNodeEditing(id, true);
    }, [id, nodeData.label, setNodeEditing]);

    // V13: Save logic - different for draft vs existing nodes
    const handleSave = useCallback(() => {
        const trimmedValue = editValue.trim();

        if (isDraft) {
            // Draft node: commit or discard
            if (trimmedValue) {
                commitDraftNode(id, trimmedValue);
            } else {
                discardDraftNode(id);
            }
        } else {
            // Existing node: update or revert
            if (trimmedValue) {
                updateNodeLabel(id, trimmedValue);
            }
            setNodeEditing(id, false);
        }
    }, [id, editValue, isDraft, commitDraftNode, discardDraftNode, updateNodeLabel, setNodeEditing]);

    // V13: Cancel logic - discard draft or just exit edit mode
    const handleCancel = useCallback(() => {
        if (isDraft) {
            discardDraftNode(id);
        } else {
            setNodeEditing(id, false);
        }
    }, [isDraft, id, discardDraftNode, setNodeEditing]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    }, [handleSave, handleCancel]);

    // V13: Click handler - position cursor instead of re-selecting
    const handleInputClick = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
        e.stopPropagation();
        // Don't do anything special - browser will position cursor naturally
    }, []);

    return (
        <>
            {/* V2: NodeResizer - visible only when selected */}
            {/* V4: NodeResizer - Synced with CSS min-width/min-height (150x60) */}
            <NodeResizer
                minWidth={150}
                minHeight={60}
                isVisible={selected}
                lineClassName="node-resizer-line"
                handleClassName="node-resizer-handle"
            />

            <div
                className={`node-base rectangle-node ${selected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${isDraft ? 'draft' : ''}`}
                style={{ width: width ?? undefined, height: height ?? undefined }}
            >
                {/* V7: Universal Handles - all type="source" with unique IDs */}
                {/* isValidConnection prevents self-loops */}
                <Handle
                    type="source"
                    position={Position.Top}
                    id="top-h"
                    isValidConnection={(connection) => connection.source !== connection.target}
                />
                <Handle
                    type="source"
                    position={Position.Bottom}
                    id="bottom-h"
                    isValidConnection={(connection) => connection.source !== connection.target}
                />
                <Handle
                    type="source"
                    position={Position.Left}
                    id="left-h"
                    isValidConnection={(connection) => connection.source !== connection.target}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="right-h"
                    isValidConnection={(connection) => connection.source !== connection.target}
                />

                {/* Label or Input */}
                {isEditing ? (
                    <input
                        ref={inputRef}
                        className="node-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        onClick={handleInputClick}
                        style={{ width: `${Math.max(editValue.length * 9, 60)}px` }}
                        placeholder={isDraft ? "Enter name..." : undefined}
                    />
                ) : (
                    <div className="node-label" onDoubleClick={handleDoubleClick}>
                        {nodeData.label}
                    </div>
                )}

                {/* Smart Collapse Button - only show if has outgoing edges */}
                {hasOutgoingEdges && (
                    <button
                        className="collapse-button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapse(id);
                        }}
                        title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                        {isCollapsed ? <Plus /> : <Minus />}
                    </button>
                )}
            </div>
        </>
    );
}

/**
 * V2 Deep Memoization: arePropsEqual
 * CRITICAL: Return TRUE (skip re-render) if only position changed.
 * React Flow handles position updates via CSS transforms, NOT React re-renders.
 * Only re-render if: id, data, selected, width, or height changes.
 */
function arePropsEqual(prevProps: NodeProps, nextProps: NodeProps): boolean {
    if (prevProps.id !== nextProps.id) return false;
    if (prevProps.selected !== nextProps.selected) return false;
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.width !== nextProps.width) return false;
    if (prevProps.height !== nextProps.height) return false;
    return true;
}

export const RectangleNode = memo(RectangleNodeComponent, arePropsEqual);
