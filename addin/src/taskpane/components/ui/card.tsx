import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...rest }) => {
  return (
    <div className={`ui-card ${className}`} {...rest}>
      {children}
    </div>
  );
};
