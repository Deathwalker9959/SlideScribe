import React from "react";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
}

export const Label: React.FC<LabelProps> = ({ htmlFor, children, className = "", ...rest }) => {
  return (
    <label className={`ui-label ${className}`} htmlFor={htmlFor} {...rest}>
      {children}
    </label>
  );
};
