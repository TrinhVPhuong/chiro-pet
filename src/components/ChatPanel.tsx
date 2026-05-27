import React, { useState } from 'react';
import { sendChatMessage } from '../services/tauriEvents';

const ChatPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendChatMessage(message);
      setMessage('');
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        className="absolute bottom-4 right-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg pointer-events-auto transition-transform hover:scale-110"
        onClick={() => setIsOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 w-80 bg-white border border-gray-200 rounded-lg shadow-xl pointer-events-auto flex flex-col overflow-hidden">
      <div className="bg-blue-500 px-4 py-2 flex justify-between items-center text-white">
        <h3 className="font-medium">Chat with Chiro</h3>
        <button onClick={() => setIsOpen(false)} className="hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input 
            type="text" 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={isSending}
            autoFocus
          />
          <button 
            type="submit" 
            disabled={isSending || !message.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white rounded-md px-3 py-2 text-sm disabled:opacity-50 flex-shrink-0"
          >
            {isSending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
