import React, { useEffect, useState } from 'react';
import { dialog, DialogOptions } from '../../services/dialog';

interface DialogState extends DialogOptions {
    id: number;
    resolve: (result: boolean) => void;
    isOpen: boolean;
}

const GlobalDialogs: React.FC = () => {
    const [dialogs, setDialogs] = useState<DialogState[]>([]);

    useEffect(() => {
        const unsubscribe = dialog.subscribe((options, resolve) => {
            const newDialog: DialogState = {
                ...options,
                id: Date.now() + Math.random(),
                resolve,
                isOpen: true,
            };
            setDialogs(prev => [...prev, newDialog]);
        });

        return unsubscribe;
    }, []);

    const closeDialog = (id: number, result: boolean) => {
        setDialogs(prev =>
            prev.map(d => d.id === id ? { ...d, isOpen: false } : d)
        );

        // Allow animation to finish before removing from DOM
        setTimeout(() => {
            setDialogs(prev => {
                const dialogToRemove = prev.find(d => d.id === id);
                if (dialogToRemove) {
                    dialogToRemove.resolve(result);
                }
                return prev.filter(d => d.id !== id);
            });
        }, 200);
    };

    if (dialogs.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
            {dialogs.map((d, index) => (
                <div key={d.id} className={`absolute inset-0 flex items-center justify-center p-4 transition-all duration-200 ${d.isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/20 transition-opacity"
                        onClick={() => d.type === 'alert' ? closeDialog(d.id, true) : closeDialog(d.id, false)}
                    />

                    {/* Dialog Box */}
                    <div
                        className={`relative bg-white rounded-lg border border-gray-200 w-full max-w-sm overflow-hidden flex flex-col transition-all duration-300 transform dark:bg-gray-900 dark:border-gray-800 ${d.isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
                        style={{ zIndex: 1000 + index }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4">
                            {d.title && <h3 className="text-sm font-semibold text-gray-900 mb-1.5 dark:text-gray-100">{d.title}</h3>}
                            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap dark:text-gray-400">{d.message}</p>
                        </div>

                        <div className="flex border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                            {d.type === 'confirm' && (
                                <button
                                    onClick={() => closeDialog(d.id, false)}
                                    className="flex-1 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors border-r border-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-800"
                                >
                                    {d.cancelText || '取消'}
                                </button>
                            )}
                            <button
                                onClick={() => closeDialog(d.id, true)}
                                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${d.type === 'alert' ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-800' : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-800'} ${d.type === 'alert' ? 'w-full' : ''}`}
                                autoFocus
                            >
                                {d.confirmText || '确定'}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GlobalDialogs;
