import { NodeData } from '../store/useGraphStore';

/**
 * V14: Smart Display Priority System
 * 
 * Determines the best value to display on a node based on a priority list.
 * 
 * Priority Order:
 * 1. User override (displayKey)
 * 2. name
 * 3. title
 * 4. label
 * 5. id (if string)
 * 6. text
 * 7. description
 * 8. content
 * 9. value
 * 10. Neo4j Label (_labels[0])
 * 11. Neo4j Internal ID (_elementId)
 * 12. Fallback: first string property
 */

const PRIORITY_KEYS = [
    'name',
    'title',
    'label',
    'id',
    'text',
    'description',
    'content',
    'value',
];

// Keys to exclude from "first available" fallback
const INTERNAL_KEYS = [
    'collapsed',
    'isEditing',
    'isDraft',
    '_elementId',
    '_labels',
    '_displayKey',
    'x',
    'y',
];

/**
 * Get the display value for a node based on smart priority
 * @param data - The node's data object
 * @param overrideKey - Optional user-specified key to prioritize
 * @returns The string value to display
 */
export function getDisplayLabel(data: NodeData, overrideKey?: string | null): string {
    // 1. Check user override
    if (overrideKey && data[overrideKey] !== undefined && data[overrideKey] !== null) {
        return String(data[overrideKey]);
    }

    // 2. Check priority keys in order
    for (const key of PRIORITY_KEYS) {
        const value = data[key];
        if (value !== undefined && value !== null && value !== '') {
            return String(value);
        }
    }

    // 3. Fallback: Neo4j Label
    const labels = data._labels as string[] | undefined;
    if (labels && Array.isArray(labels) && labels.length > 0) {
        return labels[0];
    }

    // 4. Fallback: Neo4j Internal ID (truncated)
    const elementId = data._elementId as string | undefined;
    if (elementId) {
        // Show last 8 characters for readability
        return `...${elementId.slice(-8)}`;
    }

    // 5. Fallback: First available string property
    for (const [key, value] of Object.entries(data)) {
        if (INTERNAL_KEYS.includes(key)) continue;
        if (typeof value === 'string' && value.trim() !== '') {
            return value;
        }
    }

    // 6. Ultimate fallback
    return 'Node';
}

/**
 * Get all displayable keys from node data (for UI dropdown)
 * @param data - The node's data object
 * @returns Array of key names that have displayable values
 */
export function getDisplayableKeys(data: NodeData): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        if (INTERNAL_KEYS.includes(key)) continue;
        if (value !== undefined && value !== null && value !== '') {
            keys.push(key);
        }
    }

    return keys;
}
