export interface Theme {
  name: string;
  accentColor: string;
  fileSuffix: string; // Add suffix for file names
  // Add other theme properties if needed later (e.g., background, foreground)
}

export const themes: Theme[] = [
  { name: 'Hacker Green', accentColor: '#39FF14', fileSuffix: 'hacker-green' }, // Current green
  { name: 'Electric Blue', accentColor: '#007BFF', fileSuffix: 'electric-blue' },
  { name: 'Cyber Purple', accentColor: '#9400D3', fileSuffix: 'cyber-purple' },
  { name: 'Solar Flare Orange', accentColor: '#FF4500', fileSuffix: 'solar-flare-orange' },
  { name: 'Plasma Pink', accentColor: '#FF00FF', fileSuffix: 'plasma-pink' },
  { name: 'Golden Yellow', accentColor: '#FFD700', fileSuffix: 'golden-yellow' },
];

export const defaultTheme = themes[0]; 