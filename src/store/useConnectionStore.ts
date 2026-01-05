import { create } from 'zustand';
import {
    ConnectionConfig,
    RecentConnection,
} from '../config/connection';
import { initializeAdapter as initializeDriver } from '../services/database';

// Storage keys
const STORAGE_KEYS = {
    CONNECTION: 'neo4j_connection',
    REMEMBER_ME: 'neo4j_remember_me',
    RECENT_CONNECTIONS: 'neo4j_recent_connections',
};

interface ConnectionState {
    // Current connection (null = show modal)
    currentConnection: ConnectionConfig | null;
    isAuthenticated: boolean;

    // "Remember Me" toggle
    rememberMe: boolean;

    // Recent connections history (Max 3)
    recentConnections: RecentConnection[];

    // Modal visibility
    isModalOpen: boolean;

    // Connection testing state
    isTesting: boolean;
    testError: string | null;

    // Actions
    setConnection: (config: ConnectionConfig) => void;
    clearConnection: () => void;
    setRememberMe: (remember: boolean) => void;
    addRecentConnection: (conn: RecentConnection) => void;
    openModal: () => void;
    closeModal: () => void;
    setTesting: (isTesting: boolean) => void;
    setTestError: (error: string | null) => void;

    // Persistence
    loadFromStorage: () => void;
    saveToStorage: () => void;
    clearStorage: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
    currentConnection: null,
    isAuthenticated: false,
    rememberMe: false,
    recentConnections: [],
    isModalOpen: true, // Start with modal open if not connected
    isTesting: false,
    testError: null,

    setConnection: (config) => {
        // Initialize the Neo4j driver immediately
        try {
            initializeDriver(config);
        } catch (e) {
            console.error('Failed to initialize driver:', e);
            // We still proceed to set state, user will see connection error in UI if it fails later
        }

        set({
            currentConnection: config,
            isAuthenticated: true,
            isModalOpen: false,
            testError: null,
        });

        // Add to recent connections
        get().addRecentConnection({
            provider: config.provider,
            protocol: config.protocol,
            host: config.host,
            port: config.port,
            username: config.username,
        });

        // Save to storage if "Remember Me" is enabled
        if (get().rememberMe) {
            get().saveToStorage();
        } else {
            // Save to sessionStorage instead
            try {
                sessionStorage.setItem(STORAGE_KEYS.CONNECTION, JSON.stringify(config));
            } catch (e) {
                console.error('Failed to save to sessionStorage:', e);
            }
        }
    },

    clearConnection: () => {
        set({
            currentConnection: null,
            isAuthenticated: false,
            isModalOpen: true,
        });
        get().clearStorage();
    },

    setRememberMe: (remember) => {
        set({ rememberMe: remember });
        try {
            localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, JSON.stringify(remember));
        } catch (e) {
            console.error('Failed to save rememberMe preference:', e);
        }
    },

    addRecentConnection: (conn) => {
        const current = get().recentConnections;

        // Check for duplicates (same provider + protocol + host + port)
        const key = `${conn.provider}://${conn.protocol}://${conn.host}:${conn.port}`;
        const filtered = current.filter(
            (c) => `${c.provider}://${c.protocol}://${c.host}:${c.port}` !== key
        );

        // Add to front, keep max 3
        const updated = [conn, ...filtered].slice(0, 3);

        set({ recentConnections: updated });

        // Always persist recent connections to localStorage
        try {
            localStorage.setItem(STORAGE_KEYS.RECENT_CONNECTIONS, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to save recent connections:', e);
        }
    },

    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),

    setTesting: (isTesting) => set({ isTesting }),
    setTestError: (error) => set({ testError: error }),

    loadFromStorage: () => {
        try {
            // Load "Remember Me" preference
            const rememberMeStr = localStorage.getItem(STORAGE_KEYS.REMEMBER_ME);
            const rememberMe = rememberMeStr ? JSON.parse(rememberMeStr) : false;

            // Load recent connections
            const recentStr = localStorage.getItem(STORAGE_KEYS.RECENT_CONNECTIONS);
            const recentConnections = recentStr ? JSON.parse(recentStr) : [];

            // Load connection (from localStorage if rememberMe, else sessionStorage)
            let connection: ConnectionConfig | null = null;
            if (rememberMe) {
                const connStr = localStorage.getItem(STORAGE_KEYS.CONNECTION);
                connection = connStr ? JSON.parse(connStr) : null;
            } else {
                const connStr = sessionStorage.getItem(STORAGE_KEYS.CONNECTION);
                connection = connStr ? JSON.parse(connStr) : null;
            }

            // Initialize driver if connection found
            if (connection) {
                try {
                    initializeDriver(connection);
                } catch (e) {
                    console.error('Failed to initialize driver from storage:', e);
                    // Decide if we should clear connection here? 
                    // No, let it stay, verifyConnectivity will just fail if parameters are bad.
                }
            }

            set({
                rememberMe,
                recentConnections,
                currentConnection: connection,
                isAuthenticated: connection !== null,
                isModalOpen: connection === null,
            });
        } catch (e) {
            console.error('Failed to load from storage:', e);
        }
    },

    saveToStorage: () => {
        try {
            const { currentConnection, rememberMe, recentConnections } = get();

            localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, JSON.stringify(rememberMe));
            localStorage.setItem(STORAGE_KEYS.RECENT_CONNECTIONS, JSON.stringify(recentConnections));

            if (currentConnection && rememberMe) {
                localStorage.setItem(STORAGE_KEYS.CONNECTION, JSON.stringify(currentConnection));
            }
        } catch (e) {
            console.error('Failed to save to storage:', e);
        }
    },

    clearStorage: () => {
        try {
            localStorage.removeItem(STORAGE_KEYS.CONNECTION);
            sessionStorage.removeItem(STORAGE_KEYS.CONNECTION);
            // Keep rememberMe preference and recent connections
        } catch (e) {
            console.error('Failed to clear storage:', e);
        }
    },
}));
