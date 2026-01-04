import { useState } from 'react';
import { Settings, Heart } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import './ControlDock.css';

interface ControlDockProps {
    onSettingsClick: () => void;
}

export function ControlDock({ onSettingsClick }: ControlDockProps) {
    const [showSupportTooltip, setShowSupportTooltip] = useState(false);
    const isNeo4jConnected = useGraphStore((state) => state.isNeo4jConnected);

    const handleSupportClick = () => {
        window.open('https://ko-fi.com/charlesnguyen', '_blank');
    };

    return (
        <div className="control-dock">
            {/* Settings Button with Status Dot */}
            <button
                className="control-dock__btn"
                onClick={onSettingsClick}
                title="Settings"
            >
                <Settings size={18} />
                <span
                    className={`control-dock__status-dot ${isNeo4jConnected ? '' : 'control-dock__status-dot--disconnected'
                        }`}
                />
            </button>

            {/* Support Button */}
            <button
                className="control-dock__btn control-dock__btn--support"
                onClick={handleSupportClick}
                onMouseEnter={() => setShowSupportTooltip(true)}
                onMouseLeave={() => setShowSupportTooltip(false)}
                title="Support Graphive"
            >
                <Heart size={18} />
                {showSupportTooltip && (
                    <div className="control-dock__tooltip">
                        Graphive is built and maintained independently. If it helps your workflow, you can optionally support development on Ko-fi.
                    </div>
                )}
            </button>
        </div>
    );
}
