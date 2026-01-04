import { useShallow } from 'zustand/react/shallow';
import { useConnectionStore } from '../store/useConnectionStore';
import { useGraphStore } from '../store/useGraphStore';
import { closeDriver } from '../services/neo4jService';
import './ConnectionModal.css';

export function AppHeader() {
    const { currentConnection, clearConnection } = useConnectionStore(
        useShallow((state) => ({
            currentConnection: state.currentConnection,
            clearConnection: state.clearConnection,
        }))
    );

    const isNeo4jConnected = useGraphStore((state) => state.isNeo4jConnected);

    // Don't render if not authenticated
    if (!currentConnection) return null;

    const handleLogout = async () => {
        // Close the Neo4j driver
        await closeDriver();
        // Clear connection state (this will re-open the modal)
        clearConnection();
    };

    const connectionUrl = `${currentConnection.protocol}://${currentConnection.host}:${currentConnection.port}`;

    return (
        <div className="app-header">
            <div className="app-header__connection-status">
                <span
                    className={`app-header__status-dot ${isNeo4jConnected ? '' : 'app-header__status-dot--disconnected'
                        }`}
                />
                <span title={connectionUrl}>
                    {currentConnection.host}
                </span>
            </div>
            <button className="app-header__logout-btn" onClick={handleLogout}>
                Log Out
            </button>
        </div>
    );
}
