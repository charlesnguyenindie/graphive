import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronUp, Play, Trash2, Loader2, X, Wifi, WifiOff, Plus } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import { colors, spacing, typography, shadows, radii, transitions } from '../design_tokens';

const styles: Record<string, React.CSSProperties> = {
    panel: {
        position: 'absolute',
        top: spacing.md,
        left: spacing.md,
        width: '320px',
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
        backgroundColor: colors.primary,
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
    },
    content: {
        padding: spacing.md,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: spacing.sm,
    },
    textarea: {
        width: '100%',
        minHeight: '120px',
        padding: spacing.sm,
        fontFamily: '"Fira Code", "Monaco", "Consolas", monospace',
        fontSize: typography.fontSize.sm,
        color: colors.textPrimary,
        backgroundColor: '#1E1E1E',
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: radii.sm,
        resize: 'vertical' as const,
        outline: 'none',
        lineHeight: 1.5,
    },
    buttonRow: {
        display: 'flex',
        gap: spacing.sm,
    },
    button: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        padding: `${spacing.sm} ${spacing.md}`,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        border: 'none',
        borderRadius: radii.sm,
        cursor: 'pointer',
        transition: transitions.fast,
    },
    runButton: {
        backgroundColor: colors.primary,
        color: '#FFFFFF',
    },
    runButtonDisabled: {
        backgroundColor: colors.textSecondary,
        cursor: 'not-allowed',
    },
    clearButton: {
        backgroundColor: 'transparent',
        color: colors.textSecondary,
        border: `1px solid ${colors.borderDefault}`,
    },
    errorToast: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: spacing.sm,
        backgroundColor: 'rgba(242, 78, 30, 0.1)',
        border: `1px solid ${colors.danger}`,
        borderRadius: radii.sm,
        color: colors.danger,
        fontSize: typography.fontSize.sm,
    },
    errorText: {
        flex: 1,
        wordBreak: 'break-word' as const,
    },
    errorClose: {
        cursor: 'pointer',
        flexShrink: 0,
    },
    collapsed: {
        height: 'auto',
    },
    // V8: Connection status indicator
    statusIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        fontSize: typography.fontSize.sm,
        padding: `${spacing.xs} ${spacing.sm}`,
        borderTop: `1px solid rgba(255,255,255,0.2)`,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    statusDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
    },
    syncingBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginLeft: 'auto',
        color: '#FFFFFF',
        opacity: 0.8,
    },
};

export function QueryPanel() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [localQuery, setLocalQuery] = useState('');
    const [isAdditive, setIsAdditive] = useState(true);  // V17: Additive mode toggle (default: on)

    const {
        isLoading, queryError, executeNeo4jQuery, clearCanvas, clearQueryError,
        isNeo4jConnected, isSyncing, checkNeo4jConnection,
        cypherQuery: storeCypherQuery, setCypherQuery
    } = useGraphStore(
        useShallow((state) => ({
            isLoading: state.isLoading,
            queryError: state.queryError,
            executeNeo4jQuery: state.executeNeo4jQuery,
            clearCanvas: state.clearCanvas,
            clearQueryError: state.clearQueryError,
            // V8: Sync state
            isNeo4jConnected: state.isNeo4jConnected,
            isSyncing: state.isSyncing,
            checkNeo4jConnection: state.checkNeo4jConnection,
            // V15: Dashboard query sync
            cypherQuery: state.cypherQuery,
            setCypherQuery: state.setCypherQuery,
        }))
    );

    // V15: Sync local query with store (for dashboard loading)
    useEffect(() => {
        setLocalQuery(storeCypherQuery);
    }, [storeCypherQuery]);

    // V8: Check connection on mount and periodically
    useEffect(() => {
        checkNeo4jConnection();
        const interval = setInterval(checkNeo4jConnection, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [checkNeo4jConnection]);

    const handleRun = useCallback(() => {
        if (!localQuery.trim() || isLoading) return;
        setCypherQuery(localQuery); // Sync to store before running
        executeNeo4jQuery(localQuery, isAdditive);  // V17: Pass additive flag
    }, [localQuery, isLoading, executeNeo4jQuery, setCypherQuery, isAdditive]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Cmd/Ctrl + Enter to run
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRun();
            }
        },
        [handleRun]
    );

    const toggleCollapse = useCallback(() => {
        setIsCollapsed((prev) => !prev);
    }, []);

    return (
        <div style={styles.panel}>
            {/* Header */}
            <div style={styles.header} onClick={toggleCollapse}>
                <span style={styles.headerTitle}>
                    🔍 Cypher Query
                    {/* V8: Syncing indicator */}
                    {isSyncing && (
                        <span style={styles.syncingBadge}>
                            <Loader2 size={12} className="spin" />
                        </span>
                    )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    {/* V8: Connection status */}
                    {isNeo4jConnected ? (
                        <Wifi size={14} style={{ color: '#22c55e' }} />
                    ) : (
                        <WifiOff size={14} style={{ color: '#ef4444' }} />
                    )}
                    {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div style={styles.content}>
                    {/* Textarea */}
                    <textarea
                        style={{
                            ...styles.textarea,
                            color: '#D4D4D4', // Light text for dark bg
                        }}
                        value={localQuery}
                        onChange={(e) => setLocalQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="MATCH (n)-[r]->(m) RETURN n, r, m"
                        spellCheck={false}
                    />

                    {/* V17: Additive Mode Toggle */}
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        fontSize: typography.fontSize.sm,
                        color: colors.textSecondary,
                        cursor: 'pointer',
                        userSelect: 'none' as const,
                    }}>
                        <input
                            type="checkbox"
                            checked={isAdditive}
                            onChange={(e) => setIsAdditive(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        <Plus size={12} />
                        Add to View
                    </label>

                    {/* Buttons */}
                    <div style={styles.buttonRow}>
                        <button
                            style={{
                                ...styles.button,
                                ...styles.runButton,
                                ...(isLoading ? styles.runButtonDisabled : {}),
                            }}
                            onClick={handleRun}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={14} className="spin" />
                                </>
                            ) : (
                                <>
                                    <Play size={14} />
                                </>
                            )}
                        </button>
                        <button
                            style={{ ...styles.button, ...styles.clearButton }}
                            onClick={() => {
                                if (window.confirm('This will clear all nodes from the canvas. Continue?')) {
                                    clearCanvas();
                                }
                            }}
                            title="Clear Canvas"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    {/* Error Toast */}
                    {queryError && (
                        <div style={styles.errorToast}>
                            <span style={styles.errorText}>{queryError}</span>
                            <X
                                size={14}
                                style={styles.errorClose}
                                onClick={clearQueryError}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
