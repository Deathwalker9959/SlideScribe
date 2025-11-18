import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = "", ...rest }) => {
  return (
    <div className="ui-input-wrapper">
      {label && <label className="ui-input-label">{label}</label>}
      <input className={`ui-input ${className} ${error ? "ui-input--error" : ""}`} {...rest} />
      {error && <span className="ui-input-error">{error}</span>}
    </div>
  );
};
