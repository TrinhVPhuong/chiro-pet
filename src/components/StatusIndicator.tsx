import React from 'react';

interface StatusIndicatorProps {
  visible: boolean;
  label: string;
}

const MoveIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="19 9 22 12 19 15" />
    <polyline points="9 19 12 22 15 19" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

/**
 * Badge indicator shown in the top-left corner when drag mode is active.
 */
const StatusIndicator: React.FC<StatusIndicatorProps> = ({ visible, label }) => {
  if (!visible) return null;

  return (
    <div className="absolute top-4 left-4 text-white bg-blue-500/80 px-3 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 pointer-events-none animate-pulse z-50">
      <MoveIcon />
      {label}
    </div>
  );
};

export default StatusIndicator;
