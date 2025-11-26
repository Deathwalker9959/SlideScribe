import React, { createContext, useContext, useState, ReactNode } from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
  defaultValue?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  value,
  onValueChange,
  className,
  children,
  defaultValue,
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;

  const handleValueChange = (newValue: string) => {
    if (value !== undefined) {
      onValueChange?.(newValue);
    } else {
      setInternalValue(newValue);
    }
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={`ui-tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
}) => <div className={`ui-tabs__list ${className}`}>{children}</div>;

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}

export const TabsTrigger: React.FC<
  TabsTriggerProps & React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ value, className = "", children, disabled, ...rest }) => {
  const { value: currentValue, onValueChange } = useContext(TabsContext) || {
    value: "",
    onValueChange: () => {},
  };
  const isActive = currentValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      className={`ui-tabs__trigger ${isActive ? "ui-tabs__trigger--active" : ""} ${className}`}
      onClick={() => !disabled && onValueChange(value)}
      {...rest}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  className?: string;
  children: ReactNode;
}

export const TabsContent: React.FC<TabsContentProps & React.HTMLAttributes<HTMLDivElement>> = ({
  value,
  className = "",
  children,
  ...rest
}) => {
  const { value: currentValue } = useContext(TabsContext) || { value: "" };
  const isActive = currentValue === value;

  if (!isActive) {
    return null;
  }

  return (
    <div role="tabpanel" className={`ui-tabs__content ${className}`} {...rest}>
      {children}
    </div>
  );
};
