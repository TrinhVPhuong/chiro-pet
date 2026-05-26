import React from 'react';

interface LoadingIndicatorProps {
  visible: boolean;
}

/**
 * Centered loading overlay shown while the VRM model is being loaded.
 */
const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 p-4 rounded-lg select-none pointer-events-none">
      Loading Character...
    </div>
  );
};

export default LoadingIndicator;
