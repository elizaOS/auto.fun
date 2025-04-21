import { create } from 'zustand';
import { themes, defaultTheme, Theme } from '@/config/themes';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ThemeState {
  availableThemes: Theme[];
  currentThemeIndex: number;
  cycleTheme: () => void;
  // Optional: setThemeByIndex, setThemeByName etc.
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, _) => ({
      availableThemes: themes,
      currentThemeIndex: themes.findIndex(t => t.name === defaultTheme.name) ?? 0,

      cycleTheme: () => {
        set((state) => ({
          currentThemeIndex: (state.currentThemeIndex + 1) % state.availableThemes.length,
        }));
      },
    }),
    {
      name: 'theme-storage', // Name for localStorage key
      storage: createJSONStorage(() => localStorage), // Use localStorage
      partialize: (state) => ({ currentThemeIndex: state.currentThemeIndex }), // Only persist the index
    }
  )
);

// Helper hook to get the full current theme object
export const useCurrentTheme = (): Theme => {
  const { availableThemes, currentThemeIndex } = useThemeStore();
  return availableThemes[currentThemeIndex] || defaultTheme;
}; 