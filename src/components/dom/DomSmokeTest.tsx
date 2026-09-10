'use dom';

import { useState } from 'react';

interface DomSmokeTestProps {
  message: string;
  dom?: import('expo/dom').DOMProps;
  onPing: (payload: string) => Promise<string>;
}

export default function DomSmokeTest({ message, onPing }: DomSmokeTestProps) {
  const [reply, setReply] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePing = async () => {
    setIsLoading(true);
    try {
      const result = await onPing('hello from DOM');
      setReply(result);
    } catch {
      setReply('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 20,
        backgroundColor: '#e8f5e9',
        borderRadius: 12,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>DOM Smoke Test</h2>
      <p style={{ fontSize: 14 }}>Prop from native: {message}</p>
      <button
        onClick={handlePing}
        disabled={isLoading}
        style={{
          padding: '10px 16px',
          fontSize: 14,
          borderRadius: 8,
          border: 'none',
          backgroundColor: '#2e7d32',
          color: '#fff',
        }}
      >
        {isLoading ? 'Pinging…' : 'Ping native'}
      </button>
      {reply !== null ? (
        <p style={{ fontSize: 14 }}>Native replied: {reply}</p>
      ) : null}
    </div>
  );
}
