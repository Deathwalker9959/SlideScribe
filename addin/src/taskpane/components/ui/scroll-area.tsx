import React from 'react';

export const ScrollArea: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '' }) => (
  <div className={`ui-scroll ${className}`} style={{ overflow: 'auto' }}>{children}</div>
);
