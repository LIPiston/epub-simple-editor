import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Loading...' }) => (
  <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center animate-in fade-in duration-300 dark:bg-gray-900">
      <div className="bg-white p-6 rounded-lg border border-gray-200 flex flex-col items-center max-w-xs w-full mx-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="relative mb-4">
              <div className="absolute inset-0 bg-orange-500 rounded-full blur-xl opacity-20 animate-pulse dark:bg-gray-600"></div>
              <div className="relative bg-orange-600 text-white p-3 rounded-md dark:bg-gray-600">
                  <Loader2 size={24} className="animate-spin" />
              </div>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1 tracking-tight dark:text-gray-100">请稍候</h3>
          <p className="text-xs text-gray-500 text-center dark:text-gray-400">{message}</p>
      </div>
  </div>
);

export default LoadingOverlay;