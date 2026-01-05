import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useConnectionStore } from '../store/useConnectionStore';
import {
    ConnectionConfig,
    Protocol,
    DEFAULT_PORTS,
    SECURE_PROTOCOLS,
    shouldShowMixedContentWarning,
    RecentConnection,
} from '../config/connection';
import { testConnection } from '../services/database';
import './ConnectionModal.css';

// Protocol options for dropdown
const PROTOCOL_OPTIONS: { value: Protocol; label: string }[] = [
    { value: 'bolt', label: 'bolt://' },
    { value: 'bolt+s', label: 'bolt+s://' },
    { value: 'neo4j', label: 'neo4j://' },
    { value: 'neo4j+s', label: 'neo4j+s://' },
    { value: 'http', label: 'http://' },
    { value: 'https', label: 'https://' },
];

export function ConnectionModal() {
    const {
        isModalOpen,
        rememberMe,
        recentConnections,
        isTesting,
        testError,
        setConnection,
        setRememberMe,
        setTesting,
        setTestError,
    } = useConnectionStore(
        useShallow((state) => ({
            isModalOpen: state.isModalOpen,
            rememberMe: state.rememberMe,
            recentConnections: state.recentConnections,
            isTesting: state.isTesting,
            testError: state.testError,
            setConnection: state.setConnection,
            setRememberMe: state.setRememberMe,
            setTesting: state.setTesting,
            setTestError: state.setTestError,
        }))
    );

    // Form state
    const [protocol, setProtocol] = useState<Protocol>('bolt');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('7687');
    const [username, setUsername] = useState('neo4j');
    const [password, setPassword] = useState('');

    // Derived state
    const showMixedContentWarning = shouldShowMixedContentWarning(protocol);
    const isFormValid = host.trim() !== '' && username.trim() !== '' && password.trim() !== '';

    // Protocol intelligence: auto-select based on URL input
    useEffect(() => {
        const lowerHost = host.toLowerCase();

        if (lowerHost.includes('localhost') || lowerHost.includes('127.0.0.1')) {
            // Local development → bolt
            setProtocol('bolt');
        } else if (
            lowerHost.includes('aura') ||
            lowerHost.includes('.neo4j.io') ||
            lowerHost.includes('databases.neo4j')
        ) {
            // Aura cloud → neo4j+s
            setProtocol('neo4j+s');
        }
    }, [host]);

    // Auto-fill port when protocol changes
    useEffect(() => {
        setPort(DEFAULT_PORTS[protocol]);
    }, [protocol]);

    // Fill form from recent connection
    const handleRecentClick = useCallback((recent: RecentConnection) => {
        setProtocol(recent.protocol);
        setHost(recent.host);
        setPort(recent.port);
        setUsername(recent.username);
        setPassword(''); // Password not stored in recent
        setTestError(null);
    }, [setTestError]);

    // Test and connect
    const handleConnect = useCallback(async () => {
        if (!isFormValid) return;

        setTesting(true);
        setTestError(null);

        const config: ConnectionConfig = {
            provider: 'neo4j',  // V16: Default to Neo4j
            protocol,
            host: host.trim(),
            port: port.trim() || DEFAULT_PORTS[protocol],
            username: username.trim(),
            password,
        };

        try {
            const result = await testConnection(config);

            if (result === true) {
                // Success - save connection
                setConnection(config);
            } else {
                // Error message returned
                setTestError(result);
            }
        } catch (error) {
            setTestError(error instanceof Error ? error.message : 'Connection failed');
        } finally {
            setTesting(false);
        }
    }, [protocol, host, port, username, password, isFormValid, setConnection, setTesting, setTestError]);

    // Handle Enter key
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && isFormValid && !isTesting) {
                handleConnect();
            }
        },
        [isFormValid, isTesting, handleConnect]
    );

    if (!isModalOpen) return null;

    return (
        <div className="connection-modal-overlay">
            <div className="connection-modal" onKeyDown={handleKeyDown}>
                {/* Header */}
                <div className="connection-modal__header">
                    <img
                        src="/icons/graphive_icon_64x64.png"
                        alt="Graphive Logo"
                        className="connection-modal__logo-icon"
                        width={64}
                        height={64}
                    />
                    <h2 className="connection-modal__title">Graphive</h2>
                    <p className="connection-modal__subtitle">Connect to your Neo4j Database</p>
                </div>

                {/* Form */}
                <div className="connection-modal__form">
                    {/* Protocol + Host Row */}
                    <div className="connection-modal__row">
                        <div className="connection-modal__field connection-modal__protocol">
                            <label className="connection-modal__label">Protocol</label>
                            <select
                                className="connection-modal__select"
                                value={protocol}
                                onChange={(e) => setProtocol(e.target.value as Protocol)}
                            >
                                {PROTOCOL_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="connection-modal__field connection-modal__host">
                            <label className="connection-modal__label">Host</label>
                            <input
                                type="text"
                                className="connection-modal__input"
                                placeholder="localhost or db.neo4j.io"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Port */}
                    <div className="connection-modal__field">
                        <label className="connection-modal__label">Port</label>
                        <input
                            type="text"
                            className="connection-modal__input"
                            placeholder="7687"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                        />
                    </div>

                    {/* Username */}
                    <div className="connection-modal__field">
                        <label className="connection-modal__label">Username</label>
                        <input
                            type="text"
                            className="connection-modal__input"
                            placeholder="neo4j"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    {/* Password */}
                    <div className="connection-modal__field">
                        <label className="connection-modal__label">Password</label>
                        <input
                            type="password"
                            className="connection-modal__input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {/* Mixed Content Warning */}
                    {showMixedContentWarning && (
                        <div className="connection-modal__warning">
                            <span className="connection-modal__warning-icon">⚠️</span>
                            <span>
                                <strong>Mixed Content Warning:</strong> Your app is on HTTPS but
                                you're connecting via an insecure protocol. Browsers may block
                                this. Consider using <code>neo4j+s://</code> or{' '}
                                <code>bolt+s://</code>.
                            </span>
                        </div>
                    )}

                    {/* Error Message */}
                    {testError && (
                        <div className="connection-modal__error">
                            <span>❌</span>
                            <span>{testError}</span>
                        </div>
                    )}

                    {/* Remember Me */}
                    <label className="connection-modal__remember">
                        <input
                            type="checkbox"
                            className="connection-modal__checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span className="connection-modal__remember-label">
                            Remember connection details
                        </span>
                    </label>

                    {/* Actions */}
                    <div className="connection-modal__actions">
                        <button
                            className="connection-modal__btn connection-modal__btn--primary"
                            onClick={handleConnect}
                            disabled={!isFormValid || isTesting}
                        >
                            {isTesting ? (
                                <>
                                    <span className="connection-modal__spinner" />
                                    Testing...
                                </>
                            ) : (
                                'Connect'
                            )}
                        </button>
                    </div>
                </div>

                {/* Recent Connections */}
                {recentConnections.length > 0 && (
                    <div className="connection-modal__recent">
                        <div className="connection-modal__recent-title">Recent Connections</div>
                        <div className="connection-modal__recent-list">
                            {recentConnections.map((recent, index) => (
                                <div
                                    key={`${recent.protocol}-${recent.host}-${recent.port}-${index}`}
                                    className="connection-modal__recent-item"
                                    onClick={() => handleRecentClick(recent)}
                                >
                                    <span className="connection-modal__recent-icon">🕐</span>
                                    <div className="connection-modal__recent-info">
                                        <div className="connection-modal__recent-url">
                                            {recent.protocol}://{recent.host}:{recent.port}
                                        </div>
                                        <div className="connection-modal__recent-user">
                                            User: {recent.username}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
