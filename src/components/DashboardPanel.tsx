import React, { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    ChevronDown, ChevronUp, Save, LayoutDashboard,
    Pencil, Trash2, Check, X, Loader2, Plus, GripVertical
} from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import { getDashboards, deleteDashboard } from '../services/database';
import { DashboardMeta } from '../services/database/types';
import { colors, spacing, typography, shadows, radii, transitions } from '../design_tokens';
import { useToastStore } from '../store/useToastStore';

const styles: Record<string, React.CSSProperties> = {
    panel: {
        position: 'absolute',
        top: spacing.md,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '280px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        borderRadius: radii.lg,
        boxShadow: shadows.panel,
        border: `1px solid ${colors.borderDefault}`,
        fontFamily: typography.fontFamily,
        zIndex: 10,
        overflow: 'hidden',
        transition: transitions.default,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.sm} ${spacing.md}`,
        backgroundColor: '#6366f1', // Indigo to differentiate from QueryPanel
        color: '#FFFFFF',
        cursor: 'pointer',
        userSelect: 'none' as const,
    },
    headerTitle: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    dirtyIndicator: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#fbbf24', // Amber
        marginLeft: spacing.xs,
    },
    content: {
        padding: spacing.md,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: spacing.sm,
        maxHeight: '400px',
        overflowY: 'auto' as const,
    },
    saveButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        padding: `${spacing.sm} ${spacing.md}`,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        backgroundColor: '#22c55e',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: radii.sm,
        cursor: 'pointer',
        transition: transitions.fast,
        width: '100%',
    },
    saveButtonDisabled: {
        backgroundColor: '#9ca3af',
        cursor: 'not-allowed',
    },
    divider: {
        height: '1px',
        backgroundColor: colors.borderDefault,
        margin: `${spacing.xs} 0`,
    },
    listTitle: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
    },
    dashboardItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.sm,
        borderRadius: radii.sm,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: colors.borderDefault,
        cursor: 'pointer',
        transition: transitions.fast,
    },
    dashboardItemActive: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderColor: '#6366f1',
    },
    dashboardName: {
        fontSize: typography.fontSize.sm,
        color: colors.textPrimary,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    itemActions: {
        display: 'flex',
        gap: '4px',
    },
    iconButton: {
        padding: '4px',
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        borderRadius: radii.sm,
        color: colors.textSecondary,
        transition: transitions.fast,
    },
    editInput: {
        flex: 1,
        padding: '4px 8px',
        fontSize: typography.fontSize.sm,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: radii.sm,
        outline: 'none',
    },
    emptyState: {
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        textAlign: 'center' as const,
        padding: spacing.md,
    },
    nameEditRow: {
        display: 'flex',
        gap: spacing.xs,
        marginBottom: spacing.sm,
    },
    nameInput: {
        flex: 1,
        padding: `${spacing.xs} ${spacing.sm}`,
        fontSize: typography.fontSize.sm,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: radii.sm,
        outline: 'none',
    },
    createRow: {
        display: 'flex',
        gap: spacing.xs,
        paddingBottom: spacing.sm,
        borderBottom: `1px solid ${colors.borderDefault}`,
        marginBottom: spacing.sm,
    },
    createButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xs,
        backgroundColor: colors.primary,
        color: '#FFFFFF',
        border: 'none',
        borderRadius: radii.sm,
        cursor: 'pointer',
    },
    dragHandle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.textSecondary,
        cursor: 'grab',
        paddingRight: spacing.xs,
    },
};

export function DashboardPanel() {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [dashboards, setDashboards] = useState<DashboardMeta[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [createName, setCreateName] = useState('');
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const {
        activeDashboardId,
        dashboardName,
        isDashboardDirty,
        isSyncing,
        loadDashboard,
        saveDashboard,
        setDashboardName,
        createDashboardAsCopy,
        reorderDashboards,
        renameDashboard,
    } = useGraphStore(
        useShallow((state) => ({
            activeDashboardId: state.activeDashboardId,
            dashboardName: state.dashboardName,
            isDashboardDirty: state.isDashboardDirty,
            isSyncing: state.isSyncing,
            loadDashboard: state.loadDashboard,
            saveDashboard: state.saveDashboard,
            setDashboardName: state.setDashboardName,
            createDashboardAsCopy: state.createDashboardAsCopy,
            reorderDashboards: state.reorderDashboards,
            renameDashboard: state.renameDashboard,
        }))
    );

    // Fetch dashboards when panel expands
    const fetchDashboards = useCallback(async () => {
        setIsLoadingList(true);
        try {
            const list = await getDashboards();
            setDashboards(list);
        } catch (error) {
            console.error('Failed to fetch dashboards:', error);
        } finally {
            setIsLoadingList(false);
        }
    }, []);

    useEffect(() => {
        if (!isCollapsed) {
            fetchDashboards();
        }
    }, [isCollapsed, fetchDashboards]);

    const handleSave = useCallback(async () => {
        await saveDashboard();
        fetchDashboards(); // Refresh list
    }, [saveDashboard, fetchDashboards]);

    const handleDelete = useCallback(async (id: string, name: string) => {
        if (!window.confirm(`Delete dashboard "${name}"?`)) return;

        try {
            await deleteDashboard(id);
            useToastStore.getState().addToast('success', `Dashboard "${name}" deleted`);
            fetchDashboards();
        } catch (error) {
            console.error('Failed to delete dashboard:', error);
            useToastStore.getState().addToast('error', 'Failed to delete dashboard');
        }
    }, [fetchDashboards]);

    const handleLoad = useCallback(async (id: string) => {
        if (isDashboardDirty) {
            if (!window.confirm('You have unsaved changes. Discard and load new dashboard?')) {
                return;
            }
        }
        await loadDashboard(id);
        fetchDashboards();
    }, [loadDashboard, isDashboardDirty, fetchDashboards]);

    const startEdit = useCallback((id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditName('');
    }, []);

    const handleRename = useCallback(async (id: string, newName: string) => {
        if (!newName.trim() || !id) return;
        await renameDashboard(id, newName);
        setEditingId(null);
        setEditName('');
        fetchDashboards();
    }, [renameDashboard, fetchDashboards]);

    const handleCreate = useCallback(async () => {
        if (!createName.trim()) return;
        // CREATE NEW with improved default query
        await saveDashboard(
            null,
            createName,
            'MATCH (n) OPTIONAL MATCH (n)-[r]-() RETURN n, r',
            JSON.stringify({})
        );
        setCreateName('');
        fetchDashboards();
    }, [createName, saveDashboard, fetchDashboards]);


    const onDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        // Hide preview?
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // allow drop
    };

    const onDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const oldIndex = dashboards.findIndex(d => d.id === draggedId);
        const newIndex = dashboards.findIndex(d => d.id === targetId);

        if (oldIndex < 0 || newIndex < 0) return;

        const newList = [...dashboards];
        const [moved] = newList.splice(oldIndex, 1);
        newList.splice(newIndex, 0, moved);

        setDashboards(newList);
        setDraggedId(null);

        // Persist order
        await reorderDashboards(newList.map(d => d.id));
    };

    const toggleCollapse = useCallback(() => {
        setIsCollapsed((prev) => !prev);
    }, []);

    return (
        <div style={styles.panel}>
            {/* Header */}
            <div style={styles.header} onClick={toggleCollapse}>
                <span style={styles.headerTitle}>
                    <LayoutDashboard size={16} />
                    {dashboardName}
                    {isDashboardDirty && <span style={styles.dirtyIndicator} title="Unsaved changes" />}
                </span>
                {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div style={styles.content}>
                    {/* V15.1: Create New Section */}
                    <div style={styles.createRow}>
                        <input
                            type="text"
                            style={styles.nameInput}
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="New dashboard name..."
                        />
                        <button
                            style={styles.createButton}
                            onClick={handleCreate}
                            disabled={!createName.trim() || isSyncing}
                            title="Save current view as New Dashboard"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div style={styles.listTitle}>Current Dashboard</div>
                    {/* Dashboard Name Editor */}
                    <div style={styles.nameEditRow}>
                        <input
                            type="text"
                            style={styles.nameInput}
                            value={dashboardName}
                            onChange={(e) => setDashboardName(e.target.value)}
                            placeholder="Dashboard name..."
                        />
                    </div>

                    {/* Save Button */}
                    <button
                        style={{
                            ...styles.saveButton,
                            ...(isSyncing ? styles.saveButtonDisabled : {}),
                        }}
                        onClick={handleSave}
                        disabled={isSyncing}
                    >
                        {isSyncing ? (
                            <Loader2 size={14} className="spin" />
                        ) : (
                            <>
                                <Save size={14} />
                                Save Dashboard
                            </>
                        )}
                    </button>

                    <div style={styles.divider} />

                    {/* Dashboard List */}
                    <div style={styles.listTitle}>Saved Dashboards</div>

                    {isLoadingList ? (
                        <div style={styles.emptyState}>
                            <Loader2 size={16} className="spin" />
                        </div>
                    ) : dashboards.length === 0 ? (
                        <div style={styles.emptyState}>
                            No saved dashboards yet
                        </div>
                    ) : (
                        dashboards.map((dashboard) => (
                            <div
                                key={dashboard.id}
                                draggable
                                onDragStart={(e) => onDragStart(e, dashboard.id)}
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, dashboard.id)}
                                style={{
                                    ...styles.dashboardItem,
                                    ...(dashboard.id === activeDashboardId ? styles.dashboardItemActive : {}),
                                    opacity: draggedId === dashboard.id ? 0.5 : 1,
                                }}
                                onDoubleClick={() => handleLoad(dashboard.id)}
                            >
                                <div style={styles.dragHandle}>
                                    <GripVertical size={14} />
                                </div>
                                {editingId === dashboard.id ? (
                                    <>
                                        <input
                                            type="text"
                                            style={styles.editInput}
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleRename(dashboard.id, editName);
                                                } else if (e.key === 'Escape') {
                                                    cancelEdit();
                                                }
                                            }}
                                        />
                                        <div style={styles.itemActions}>
                                            <button
                                                style={{ ...styles.iconButton, color: 'var(--success)' }}
                                                onClick={() => handleRename(dashboard.id, editName)}
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button style={styles.iconButton} onClick={cancelEdit}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span style={styles.dashboardName}>
                                            {dashboard.id === activeDashboardId && '● '}
                                            {dashboard.name}
                                        </span>
                                        <div style={styles.itemActions}>
                                            <button
                                                style={styles.iconButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEdit(dashboard.id, dashboard.name);
                                                }}
                                                title="Rename"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                style={styles.iconButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(dashboard.id, dashboard.name);
                                                }}
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
