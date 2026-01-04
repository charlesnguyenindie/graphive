import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore, ToastType } from '../store/useToastStore';
import './ToastContainer.css';

const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
};

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`toast toast--${toast.type}`}
                >
                    <span className="toast__icon">{iconMap[toast.type]}</span>
                    <span className="toast__message">{toast.message}</span>
                    <button
                        className="toast__close"
                        onClick={() => removeToast(toast.id)}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
