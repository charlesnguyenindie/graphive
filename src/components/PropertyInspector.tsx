import { useState, useEffect } from 'react';
import { Plus, Trash2, Eye, Network, X, Tag } from 'lucide-react';
import { useGraphStore, NodeData } from '../store/useGraphStore';
import { Node } from '@xyflow/react';
import './PropertyInspector.css';

/**
 * PropertyInspector - Dynamic panel for viewing/editing node properties
 * V14: Shows when a node is selected
 */
export function PropertyInspector() {
    const nodes = useGraphStore((state) => state.nodes);
    const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty);
    const deleteNodeProperty = useGraphStore((state) => state.deleteNodeProperty);
    const addNodeProperty = useGraphStore((state) => state.addNodeProperty);
    const updateNodeLabel = useGraphStore((state) => state.updateNodeLabel);
    const expandNeighbors = useGraphStore((state) => state.expandNeighbors);
    // V14: Label management
    const addLabel = useGraphStore((state) => state.addLabel);
    const removeLabel = useGraphStore((state) => state.removeLabel);

    // Get first selected node
    const selectedNode = nodes.find((n) => n.selected) as Node<NodeData> | undefined;

    // State for adding new property
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [isAddingProperty, setIsAddingProperty] = useState(false);

    // State for editing values
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // Reset state when selection changes
    useEffect(() => {
        setIsAddingProperty(false);
        setNewKey('');
        setNewValue('');
        setEditingKey(null);
    }, [selectedNode?.id]);

    // Don't render if no node selected
    if (!selectedNode) return null;

    // Extract properties (exclude internal/special keys - shown separately above)
    const properties = Object.entries(selectedNode.data).filter(
        ([key]) => !['label', 'collapsed', 'isEditing', 'isDraft', 'x', 'y', '_elementId', '_labels'].includes(key)
    );

    const handleStartEdit = (key: string, value: unknown) => {
        setEditingKey(key);
        setEditValue(String(value ?? ''));
    };

    const handleSaveEdit = () => {
        if (editingKey && selectedNode) {
            updateNodeProperty(selectedNode.id, editingKey, editValue);
            setEditingKey(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            setEditingKey(null);
        }
    };

    const handleAddProperty = () => {
        if (newKey.trim() && selectedNode) {
            addNodeProperty(selectedNode.id, newKey.trim(), newValue);
            setNewKey('');
            setNewValue('');
            setIsAddingProperty(false);
        }
    };

    const handleDelete = (key: string) => {
        if (selectedNode) {
            deleteNodeProperty(selectedNode.id, key);
        }
    };

    const handleSetAsLabel = (key: string, value: unknown) => {
        if (selectedNode) {
            updateNodeLabel(selectedNode.id, String(value ?? ''));
        }
    };

    const handleExpandNeighbors = () => {
        if (selectedNode) {
            expandNeighbors(selectedNode.id);
        }
    };

    return (
        <div className="property-inspector">
            <div className="property-inspector__header">
                <h3 className="property-inspector__title">
                    {selectedNode.data.label || 'Unnamed Node'}
                </h3>
                <button
                    className="property-inspector__expand-btn"
                    onClick={handleExpandNeighbors}
                    title="Expand Neighbors"
                >
                    <Network size={16} />
                    Expand
                </button>
            </div>

            <div className="property-inspector__list">
                {/* V14: Show Neo4j ID (read-only) */}
                {selectedNode.data._elementId && (
                    <div className="property-inspector__row">
                        <span className="property-inspector__key" style={{ opacity: 0.6 }}>id</span>
                        <span className="property-inspector__value" style={{ opacity: 0.6, fontSize: '10px' }}>
                            {String(selectedNode.data._elementId).slice(-12)}
                        </span>
                    </div>
                )}

                {/* V14: Show Neo4j Labels as editable chips */}
                <div className="property-inspector__row property-inspector__labels-row">
                    <span className="property-inspector__key">labels</span>
                    <div className="property-inspector__labels">
                        {selectedNode.data._labels && Array.isArray(selectedNode.data._labels) &&
                            (selectedNode.data._labels as string[]).map((l) => (
                                <span key={l} className="property-inspector__label-chip">
                                    :{l}
                                    <button
                                        className="property-inspector__label-remove"
                                        onClick={() => removeLabel(selectedNode.id, l)}
                                        title="Remove label"
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))
                        }
                        <button
                            className="property-inspector__label-add"
                            onClick={() => {
                                const label = prompt('Enter label name:');
                                if (label && selectedNode) addLabel(selectedNode.id, label);
                            }}
                            title="Add label"
                        >
                            <Plus size={12} />
                        </button>
                    </div>
                </div>

                {properties.length === 0 && !isAddingProperty && !selectedNode.data._elementId && (
                    <div className="property-inspector__empty">
                        No properties
                    </div>
                )}

                {properties.map(([key, value]) => (
                    <div key={key} className="property-inspector__row">
                        <button
                            className="property-inspector__caption-btn"
                            onClick={() => handleSetAsLabel(key, value)}
                            title="Set as display label"
                        >
                            <Eye size={14} />
                        </button>
                        <span className="property-inspector__key">{key}</span>
                        {editingKey === key ? (
                            <input
                                className="property-inspector__input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleSaveEdit}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />
                        ) : (
                            <span
                                className="property-inspector__value"
                                onClick={() => handleStartEdit(key, value)}
                            >
                                {String(value ?? '')}
                            </span>
                        )}
                        <button
                            className="property-inspector__delete-btn"
                            onClick={() => handleDelete(key)}
                            title="Delete property"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}

                {/* Add Property Form */}
                {isAddingProperty && (
                    <div className="property-inspector__add-form">
                        <input
                            className="property-inspector__input"
                            placeholder="Key"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            autoFocus
                        />
                        <input
                            className="property-inspector__input"
                            placeholder="Value"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddProperty()}
                        />
                        <button
                            className="property-inspector__confirm-btn"
                            onClick={handleAddProperty}
                        >
                            Add
                        </button>
                    </div>
                )}
            </div>

            {/* Add Property Button */}
            {!isAddingProperty && (
                <button
                    className="property-inspector__add-btn"
                    onClick={() => setIsAddingProperty(true)}
                >
                    <Plus size={14} />
                    Add Property
                </button>
            )}
        </div>
    );
}
