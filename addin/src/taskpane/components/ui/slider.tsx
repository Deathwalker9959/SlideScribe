import React from 'react';

interface SliderProps {
  value?: number[];
  onValueChange?: (v: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({ value = [0], onValueChange, min = 0, max = 100, step = 1, className = '' }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(e.target.value);
    onValueChange && onValueChange([num]);
  };
  return (
    <input type="range" value={value[0]} min={min} max={max} step={step} onChange={handleChange} className={`ui-slider ${className}`} />
  );
};
