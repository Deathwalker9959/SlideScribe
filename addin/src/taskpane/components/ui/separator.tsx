import React from 'react';

export const Separator: React.FC<{ className?: string }> = ({ className = '' }) => (
  <hr className={`ui-separator ${className}`} />
);
