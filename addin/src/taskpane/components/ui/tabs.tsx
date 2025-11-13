import React from 'react';

interface TabsProps {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ children, className = '' }) => <div className={`ui-tabs ${className}`}>{children}</div>;
export const TabsList: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '' }) => (
  <div className={`ui-tabs__list ${className}`}>{children}</div>
);
export const TabsTrigger: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { value?: string }> = ({ children, className = '', ...rest }) => (
  <button className={`ui-tabs__trigger ${className}`} {...rest}>{children}</button>
);
export const TabsContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '' }) => (
  <div className={`ui-tabs__content ${className}`}>{children}</div>
);
