import React, { CSSProperties } from 'react';
import { useCurrentTheme } from '@/stores/useThemeStore';

export type ThemedUiElementType = 'progress' | 'buyon' | 'sellon' | 'selloff' | 'swapup' | 'stars';

interface ThemedUiElementProps {
  type: ThemedUiElementType;
  className?: string;
  alt?: string;
  style?: CSSProperties;
}

export const ThemedUiElement: React.FC<ThemedUiElementProps> = ({ 
  type,
  className = "", 
  alt = "",
  style
}) => {
  const currentTheme = useCurrentTheme();
  
  // Use the themed element based on current theme
  const elementSrc = `/hues/buy_sell_swap_progress/${type}-${currentTheme.fileSuffix}.svg`;
  
  return (
    <img 
      src={elementSrc} 
      alt={alt || `${type} element`} 
      className={className}
      style={style}
    />
  );
};

export default ThemedUiElement; 