import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../store/useGraphStore';

// Default node dimensions for collision
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

interface ForceNode extends SimulationNodeDatum {
    id: string;
    x?: number;
    y?: number;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
    source: string | ForceNode;
    target: string | ForceNode;
}

/**
 * Apply d3-force layout for organic node positioning
 * V14: Force-directed graph for natural clustering
 */
export function getForceLayoutedElements(
    nodes: Node<NodeData>[],
    edges: Edge[],
    width: number = 800,
    height: number = 600
): { nodes: Node<NodeData>[]; edges: Edge[] } {
    if (nodes.length === 0) {
        return { nodes, edges };
    }

    // Convert to d3-force format
    const forceNodes: ForceNode[] = nodes.map((node) => ({
        id: node.id,
        x: node.position.x || width / 2,
        y: node.position.y || height / 2,
    }));

    const forceLinks: ForceLink[] = edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
    }));

    // Create simulation with stronger repulsion for no overlap
    const simulation = forceSimulation<ForceNode>(forceNodes)
        .force('link', forceLink<ForceNode, ForceLink>(forceLinks).id((d) => d.id).distance(200))
        .force('charge', forceManyBody().strength(-500))  // V14: Stronger repulsion
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide().radius(Math.max(NODE_WIDTH, NODE_HEIGHT) / 2 + 40))  // V14: Larger collision
        .stop();

    // Run simulation synchronously (300 ticks)
    for (let i = 0; i < 300; i++) {
        simulation.tick();
    }

    // Create node ID map for quick lookup
    const positionMap = new Map<string, { x: number; y: number }>();
    for (const node of forceNodes) {
        positionMap.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
    }

    // Apply positions back to React Flow nodes
    const layoutedNodes = nodes.map((node) => {
        const pos = positionMap.get(node.id);
        return {
            ...node,
            position: {
                x: pos?.x ?? node.position.x,
                y: pos?.y ?? node.position.y,
            },
        };
    });

    return {
        nodes: layoutedNodes,
        edges,
    };
}
