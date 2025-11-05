import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'secondary' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant, className = '', ...rest }) => {
  const variantClass = variant === 'secondary' ? 'ui-badge--secondary' : 'ui-badge--outline';
  return (
    <span className={`ui-badge ${variantClass} ${className}`} {...rest}>
      {children}
    </span>
  );
};
