import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Minus, Plus, Maximize, Lock, Unlock, Settings, Heart } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import './UnifiedControls.css';

interface UnifiedControlsProps {
    onSettingsClick: () => void;
}

export function UnifiedControls({ onSettingsClick }: UnifiedControlsProps) {
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const [showSupportTooltip, setShowSupportTooltip] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const isNeo4jConnected = useGraphStore((state) => state.isNeo4jConnected);

    const handleSupportClick = () => {
        window.open('https://ko-fi.com/charlesnguyen', '_blank');
    };

    const handleLockToggle = () => {
        setIsLocked(!isLocked);
        // Note: Actual viewport locking would require additional React Flow integration
    };

    return (
        <div className="unified-controls">
            {/* Zoom In */}
            <button className="unified-controls__btn" onClick={() => zoomIn()} title="Zoom In">
                <Plus size={18} />
            </button>

            {/* Zoom Out */}
            <button className="unified-controls__btn" onClick={() => zoomOut()} title="Zoom Out">
                <Minus size={18} />
            </button>

            {/* Fit View */}
            <button className="unified-controls__btn" onClick={() => fitView({ padding: 0.2 })} title="Fit View">
                <Maximize size={18} />
            </button>

            {/* V13: Lock View */}
            <button
                className={`unified-controls__btn ${isLocked ? 'unified-controls__btn--active' : ''}`}
                onClick={handleLockToggle}
                title={isLocked ? "Unlock View" : "Lock View"}
            >
                {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>

            {/* Divider */}
            <div className="unified-controls__divider" />

            {/* Settings (Gear) */}
            <button
                className="unified-controls__btn"
                onClick={onSettingsClick}
                title="Settings"
            >
                <Settings size={18} />
                <span
                    className={`unified-controls__status-dot ${isNeo4jConnected ? '' : 'unified-controls__status-dot--disconnected'
                        }`}
                />
            </button>

            {/* Support (Heart) */}
            <button
                className="unified-controls__btn unified-controls__btn--support"
                onClick={handleSupportClick}
                onMouseEnter={() => setShowSupportTooltip(true)}
                onMouseLeave={() => setShowSupportTooltip(false)}
                title="Support Graphive"
            >
                <Heart size={18} />
                {showSupportTooltip && (
                    <div className="unified-controls__tooltip">
                        Graphive is built and maintained independently. If it helps your workflow, you can optionally support development on Ko-fi.
                    </div>
                )}
            </button>
        </div>
    );
}
