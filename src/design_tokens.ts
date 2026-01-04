/**
 * Miro-like Design Tokens
 * These tokens serves as the single source of truth for the application's visual style.
 */

export const colors = {
    // Backgrounds
    canvasBg: '#F5F6F8', // Light gray infinite canvas
    nodeBg: '#FFFFFF',

    // Brand / Interaction
    primary: '#2680EB', // Bright Miro-like Blue for selection/action
    primaryHover: '#1E63B8',

    // Text
    textPrimary: '#050038', // Deep dark blue/black
    textSecondary: '#808080',

    // Borders
    borderDefault: '#E5E5E5',
    borderSelected: '#2680EB',

    // Semantic
    danger: '#F24E1E',
    success: '#0CA789',
};

export const spacing = {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
};

export const typography = {
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: {
        sm: '12px',
        md: '14px',
        lg: '16px',
        xl: '20px',
    },
    fontWeight: {
        regular: 400,
        medium: 500,
        bold: 600,
    },
};

export const shadows = {
    node: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    nodeSelected: '0px 4px 12px rgba(38, 128, 235, 0.2)',
    // V2: Clean selection halo for multi-select
    selectionHalo: '0 0 0 2px #2680EB',
    panel: '0px 4px 16px rgba(0, 0, 0, 0.1)',
};

export const radii = {
    sm: '4px',
    md: '8px',
    lg: '12px',
    circle: '50%',
};

export const transitions = {
    default: 'all 0.2s ease-in-out',
    fast: 'all 0.1s ease',
};
