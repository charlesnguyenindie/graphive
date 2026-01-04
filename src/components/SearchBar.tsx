import { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Search, X } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import './SearchBar.css';

export function SearchBar() {
    const [query, setQuery] = useState('');
    const [notFound, setNotFound] = useState(false);
    const { setCenter, getNodes } = useReactFlow();
    const setHighlightedNode = useGraphStore((state) => state.setHighlightedNode);

    const handleSearch = useCallback(() => {
        if (!query.trim()) return;

        const nodes = getNodes();
        const searchTerm = query.toLowerCase().trim();

        // Find node by label (case-insensitive partial match)
        const foundNode = nodes.find((node) => {
            const label = (node.data as { label?: string })?.label?.toLowerCase() || '';
            return label.includes(searchTerm) && !node.hidden;
        });

        if (foundNode) {
            setNotFound(false);

            // Get node dimensions for proper centering
            const nodeWidth = foundNode.measured?.width ?? 150;
            const nodeHeight = foundNode.measured?.height ?? 60;

            // Center viewport on the node with smooth animation
            setCenter(
                foundNode.position.x + nodeWidth / 2,
                foundNode.position.y + nodeHeight / 2,
                { zoom: 1.5, duration: 800 }
            );

            // Trigger highlight effect on the found node
            setHighlightedNode(foundNode.id);
        } else {
            setNotFound(true);
            // Clear not-found state after 2 seconds
            setTimeout(() => setNotFound(false), 2000);
        }
    }, [query, getNodes, setCenter, setHighlightedNode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
        if (e.key === 'Escape') {
            setQuery('');
            setNotFound(false);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setNotFound(false);
    };

    return (
        <div className={`search-bar ${notFound ? 'not-found' : ''}`}>
            <Search className="search-icon" />
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setNotFound(false);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search nodes..."
                className="search-input"
            />
            {query && (
                <button className="clear-button" onClick={clearSearch}>
                    <X />
                </button>
            )}
            {notFound && <span className="not-found-text">Not found</span>}
        </div>
    );
}
