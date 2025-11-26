import React from "react";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive";
}

export const Alert: React.FC<AlertProps> = ({
  variant = "default",
  children,
  className = "",
  ...rest
}) => {
  return (
    <div className={`ui-alert ui-alert--${variant} ${className}`} {...rest}>
      {children}
    </div>
  );
};

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}

export const AlertDescription: React.FC<AlertDescriptionProps> = ({
  children,
  className = "",
  ...rest
}) => {
  return (
    <div className={`ui-alert-description ${className}`} {...rest}>
      {children}
    </div>
  );
};
