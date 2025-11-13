import React, { useState, createContext, useContext } from 'react';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({ value: controlledValue, defaultValue = '', onValueChange, children, className = '' }) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  
  const handleValueChange = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
    setIsOpen(false);
  };

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, isOpen, setIsOpen }}>
      <div className={`ui-select ${className}`}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

export const SelectTrigger: React.FC<{ className?: string, children?: React.ReactNode }> = ({ children, className = '' }) => {
  const context = useContext(SelectContext);
  
  return (
    <div 
      className={`ui-select__trigger ${className}`}
      onClick={() => context?.setIsOpen(!context.isOpen)}
      style={{ 
        cursor: 'pointer',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
    >
      {children}
    </div>
  );
};

export const SelectValue: React.FC = () => {
  const context = useContext(SelectContext);
  return <span className="ui-select__value" style={{ 
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%'
  }}>{context?.value || 'Select...'}</span>;
};

export const SelectContent: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const context = useContext(SelectContext);
  
  if (!context?.isOpen) return null;
  
  return (
    <div className="ui-select__content" style={{
      position: 'absolute',
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '0.375rem',
      marginTop: '0.25rem',
      zIndex: 1000,
      minWidth: '100%',
      maxWidth: '200px',
      maxHeight: '200px',
      overflowY: 'auto',
      boxSizing: 'border-box'
    }}>
      {children}
    </div>
  );
};

export const SelectItem: React.FC<{ value: string; children?: React.ReactNode }> = ({ value, children }) => {
  const context = useContext(SelectContext);
  
  return (
    <div 
      className="ui-select__item"
      onClick={() => context?.onValueChange(value)}
      style={{
        padding: '0.5rem',
        cursor: 'pointer',
        color: 'white',
        backgroundColor: context?.value === value ? '#374151' : 'transparent',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box'
      }}
      onMouseEnter={(e) => {
        if (context?.value !== value) {
          e.currentTarget.style.backgroundColor = '#2d3748';
        }
      }}
      onMouseLeave={(e) => {
        if (context?.value !== value) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {children}
    </div>
  );
};
