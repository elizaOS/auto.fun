import React, { CSSProperties } from 'react';
import { useCurrentTheme } from '@/stores/useThemeStore';

interface ThemedLogoProps {
  className?: string;
  alt?: string;
  style?: CSSProperties;
}

export const ThemedLogo: React.FC<ThemedLogoProps> = ({ 
  className = "w-4/5 max-w-[400px]", 
  alt = "Auto.fun Logo",
  style
}) => {
  const currentTheme = useCurrentTheme();
  
  // Use the themed logo based on current theme
  const logoSrc = `/hues/logo_wide/logo_wide-${currentTheme.fileSuffix}.svg`;
  
  return (
    <img 
      src={logoSrc} 
      alt={alt} 
      className={className}
      style={style}
    />
  );
};

export default ThemedLogo; 