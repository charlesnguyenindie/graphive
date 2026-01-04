import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../store/useGraphStore';

// Default node dimensions for layout calculation
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/**
 * Apply Dagre layout to position nodes in a tree structure
 */
export function getLayoutedElements(
    nodes: Node<NodeData>[],
    edges: Edge[],
    direction: 'TB' | 'LR' = 'TB'
): { nodes: Node<NodeData>[]; edges: Edge[] } {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Configure graph direction
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 50,
        ranksep: 80,
        marginx: 20,
        marginy: 20,
    });

    // Add nodes to dagre
    for (const node of nodes) {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    // Add edges to dagre
    for (const edge of edges) {
        dagreGraph.setEdge(edge.source, edge.target);
    }

    // Run the layout algorithm
    dagre.layout(dagreGraph);

    // Apply calculated positions to nodes
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - NODE_WIDTH / 2,
                y: nodeWithPosition.y - NODE_HEIGHT / 2,
            },
        };
    });

    return {
        nodes: layoutedNodes,
        edges,
    };
}
