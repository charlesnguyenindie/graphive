import { useShallow } from 'zustand/react/shallow';
import { X, Trash2, EyeOff } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import { colors, spacing, typography, shadows, radii } from '../design_tokens';

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    modal: {
        backgroundColor: '#FFFFFF',
        borderRadius: radii.lg,
        boxShadow: shadows.panel,
        width: '400px',
        maxWidth: '90vw',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.md} ${spacing.lg}`,
        backgroundColor: colors.danger,
        color: '#FFFFFF',
    },
    title: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
        margin: 0,
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#FFFFFF',
        cursor: 'pointer',
        padding: spacing.xs,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.8,
    },
    content: {
        padding: spacing.lg,
    },
    message: {
        fontSize: typography.fontSize.md,
        color: colors.textPrimary,
        marginBottom: spacing.lg,
        lineHeight: 1.5,
    },
    count: {
        fontWeight: typography.fontWeight.bold,
        color: colors.danger,
    },
    buttonRow: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: spacing.sm,
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: `${spacing.md} ${spacing.lg}`,
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        border: 'none',
        borderRadius: radii.md,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    removeButton: {
        backgroundColor: colors.canvasBg,
        color: colors.textPrimary,
        border: `1px solid ${colors.borderDefault}`,
    },
    deleteButton: {
        backgroundColor: colors.danger,
        color: '#FFFFFF',
    },
    hint: {
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
};

export function DeleteModal() {
    const {
        isDeleteModalOpen,
        setDeleteModalOpen,
        removeSelectedFromUI,
        deleteSelectedFromDB,
        nodes,
        edges,
    } = useGraphStore(
        useShallow((state) => ({
            isDeleteModalOpen: state.isDeleteModalOpen,
            setDeleteModalOpen: state.setDeleteModalOpen,
            removeSelectedFromUI: state.removeSelectedFromUI,
            deleteSelectedFromDB: state.deleteSelectedFromDB,
            nodes: state.nodes,
            edges: state.edges,
        }))
    );

    if (!isDeleteModalOpen) return null;

    const selectedNodeCount = nodes.filter((n) => n.selected).length;
    const selectedEdgeCount = edges.filter((e) => e.selected).length;

    const handleRemoveFromView = () => {
        removeSelectedFromUI();
    };

    const handleDeletePermanently = () => {
        deleteSelectedFromDB();
    };

    const handleClose = () => {
        setDeleteModalOpen(false);
    };

    return (
        <div style={styles.overlay} onClick={handleClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>Delete Selection?</h2>
                    <button style={styles.closeButton} onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    <p style={styles.message}>
                        You are about to remove{' '}
                        <span style={styles.count}>
                            {selectedNodeCount} node{selectedNodeCount !== 1 ? 's' : ''}
                        </span>
                        {selectedEdgeCount > 0 && (
                            <>
                                {' and '}
                                <span style={styles.count}>
                                    {selectedEdgeCount} edge{selectedEdgeCount !== 1 ? 's' : ''}
                                </span>
                            </>
                        )}
                        .
                    </p>

                    <div style={styles.buttonRow}>
                        <button
                            style={{ ...styles.button, ...styles.removeButton }}
                            onClick={handleRemoveFromView}
                        >
                            <EyeOff size={18} />
                            Remove from View
                        </button>
                        <p style={styles.hint}>
                            Hides from canvas. Data remains in database.
                        </p>

                        <button
                            style={{ ...styles.button, ...styles.deleteButton }}
                            onClick={handleDeletePermanently}
                        >
                            <Trash2 size={18} />
                            Delete Permanently
                        </button>
                        <p style={styles.hint}>
                            ⚠️ Removes from canvas AND deletes from database.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
