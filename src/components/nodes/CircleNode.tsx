import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { Minus, Plus } from 'lucide-react';
import { useGraphStore, NodeData } from '../../store/useGraphStore';
import { getDisplayLabel } from '../../utils/nodeDisplay';
import './nodes.css';

/**
 * CircleNode - V2 with NodeResizer
 * Features: 4 handles, inline editing, smart collapse button, resizable
 * Performance: Deep memoization ignoring position changes
 */
function CircleNodeComponent({ id, data, selected, width, height }: NodeProps) {
    // V2: Use useShallow to prevent re-renders from unrelated store changes
    const { toggleCollapse, updateNodeLabel, setNodeEditing, highlightedNodeId, edges } =
        useGraphStore(
            useShallow((state) => ({
                toggleCollapse: state.toggleCollapse,
                updateNodeLabel: state.updateNodeLabel,
                setNodeEditing: state.setNodeEditing,
                highlightedNodeId: state.highlightedNodeId,
                edges: state.edges,
            }))
        );

    const nodeData = data as NodeData;
    const isCollapsed = nodeData.collapsed ?? false;
    const isEditing = nodeData.isEditing ?? false;
    const isHighlighted = highlightedNodeId === id;

    // Smart button: only show if this node has outgoing edges
    const hasOutgoingEdges = edges.some((e) => e.source === id);

    // Local state for editing
    const [editValue, setEditValue] = useState(getDisplayLabel(nodeData) || '');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Double-click to enter edit mode
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(getDisplayLabel(nodeData) || '');
        setNodeEditing(id, true);
    }, [id, nodeData, setNodeEditing]);

    // Save on Enter or blur
    const handleSave = useCallback(() => {
        if (editValue.trim()) {
            updateNodeLabel(id, editValue.trim());
        }
        setNodeEditing(id, false);
    }, [id, editValue, updateNodeLabel, setNodeEditing]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setNodeEditing(id, false);
        }
    }, [handleSave, id, setNodeEditing]);

    // V3: Circle default size 100x100, use min of provided or default
    const size = Math.max(width ?? 100, height ?? 100, 50); // Ensure minimum 50

    return (
        <>
            {/* V2: NodeResizer - visible only when selected */}
            {/* V3: NodeResizer with 50x50 min constraints */}
            <NodeResizer
                minWidth={50}
                minHeight={50}
                isVisible={selected}
                keepAspectRatio={true}
                lineClassName="node-resizer-line"
                handleClassName="node-resizer-handle"
            />

            <div
                className={`node-base circle-node ${selected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                style={{ width: size, height: size, overflow: 'hidden' }}
            >
                {/* 4 Universal Handles */}
                <Handle type="target" position={Position.Top} id="top-h" />
                <Handle type="source" position={Position.Bottom} id="bottom-h" />
                <Handle type="source" position={Position.Left} id="left-h" />
                <Handle type="source" position={Position.Right} id="right-h" />

                {/* Label or Input */}
                {isEditing ? (
                    <input
                        ref={inputRef}
                        className="node-edit-input circle-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        style={{ width: `${Math.max(editValue.length * 8, 50)}px` }}
                    />
                ) : (
                    <div className="node-label" onDoubleClick={handleDoubleClick}>
                        {getDisplayLabel(nodeData, nodeData._displayKey as string | undefined)}
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
 */
function arePropsEqual(prevProps: NodeProps, nextProps: NodeProps): boolean {
    if (prevProps.id !== nextProps.id) return false;
    if (prevProps.selected !== nextProps.selected) return false;
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.width !== nextProps.width) return false;
    if (prevProps.height !== nextProps.height) return false;
    return true;
}

export const CircleNode = memo(CircleNodeComponent, arePropsEqual);
