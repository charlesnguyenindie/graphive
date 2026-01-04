import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastState {
    toasts: Toast[];
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
    toasts: [],

    addToast: (type, message) => {
        const id = `toast-${Date.now()}`;
        const newToast: Toast = { id, type, message };

        set({ toasts: [...get().toasts, newToast] });

        // Auto-remove after 4 seconds
        setTimeout(() => {
            get().removeToast(id);
        }, 4000);
    },

    removeToast: (id) => {
        set({ toasts: get().toasts.filter(t => t.id !== id) });
    },
}));
