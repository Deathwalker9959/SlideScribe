import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea: React.FC<TextareaProps> = (props) => {
  return <textarea className={`ui-textarea ${props.className || ""}`} {...props} />;
};
