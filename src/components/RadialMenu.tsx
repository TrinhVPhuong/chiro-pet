import React from 'react';

interface RadialMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const RadialMenu: React.FC<RadialMenuProps> = ({ x, y, onClose }) => {
  return (
    <div 
      className="fixed z-50 rounded-full bg-white/20 backdrop-blur-md shadow-lg flex flex-col gap-2 items-center justify-center p-4 border border-white/30"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex gap-2 pointer-events-auto">
        <button 
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer" 
          onClick={onClose}
        >
          Action 1
        </button>
        <button 
          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer" 
          onClick={onClose}
        >
          Action 2
        </button>
      </div>
      <button 
        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer pointer-events-auto" 
        onClick={onClose}
      >
        Close Menu
      </button>
    </div>
  );
};

export default RadialMenu;
