import { useShallow } from 'zustand/react/shallow';
import { X, ExternalLink, Mail } from 'lucide-react';
import { useConnectionStore } from '../store/useConnectionStore';
import { useGraphStore } from '../store/useGraphStore';
import { closeAdapter as closeDriver } from '../services/database';
import './SettingsModal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { currentConnection, clearConnection } = useConnectionStore(
        useShallow((state) => ({
            currentConnection: state.currentConnection,
            clearConnection: state.clearConnection,
        }))
    );

    const isNeo4jConnected = useGraphStore((state) => state.isNeo4jConnected);

    // Don't render if not authenticated or modal is closed
    if (!currentConnection || !isOpen) return null;

    const handleLogout = async () => {
        await closeDriver();
        clearConnection();
        onClose();
    };

    const connectionUri = `${currentConnection.protocol}://${currentConnection.host}:${currentConnection.port}`;

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="settings-modal__header">
                    <h2 className="settings-modal__title">Settings</h2>
                    <button
                        className="settings-modal__close"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="settings-modal__content">
                    {/* Connection Section */}
                    <div className="settings-modal__section">
                        <h3 className="settings-modal__section-title">Connection</h3>
                        <div className="settings-modal__info-row">
                            <span className="settings-modal__label">Status</span>
                            <span className={`settings-modal__value ${isNeo4jConnected ? 'settings-modal__value--connected' : 'settings-modal__value--disconnected'}`}>
                                {isNeo4jConnected ? '🟢 Connected' : '🔴 Disconnected'}
                            </span>
                        </div>
                        <div className="settings-modal__info-row">
                            <span className="settings-modal__label">URI</span>
                            <span className="settings-modal__value settings-modal__value--mono">
                                {connectionUri}
                            </span>
                        </div>
                        <div className="settings-modal__info-row">
                            <span className="settings-modal__label">Username</span>
                            <span className="settings-modal__value">
                                {currentConnection.username}
                            </span>
                        </div>
                    </div>

                    {/* Contact Section */}
                    <div className="settings-modal__section">
                        <h3 className="settings-modal__section-title">Contact</h3>
                        <p className="settings-modal__text">
                            Reach me anytime for feedback or questions.
                        </p>
                        <a
                            href="mailto:charles.nguyen.indie@gmail.com"
                            className="settings-modal__link"
                        >
                            <Mail size={14} />
                            charles.nguyen.indie@gmail.com
                        </a>
                    </div>

                    {/* Logout Button */}
                    <div className="settings-modal__actions">
                        <button
                            className="settings-modal__logout-btn"
                            onClick={handleLogout}
                        >
                            Log Out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
