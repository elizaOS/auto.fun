import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name properly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read themes from config file to get the color values
const themes = [
  { name: 'Hacker Green', accentColor: '#39FF14', fileSuffix: 'hacker-green' },
  { name: 'Electric Blue', accentColor: '#007BFF', fileSuffix: 'electric-blue' },
  { name: 'Cyber Purple', accentColor: '#9400D3', fileSuffix: 'cyber-purple' },
  { name: 'Solar Flare Orange', accentColor: '#FF4500', fileSuffix: 'solar-flare-orange' },
  { name: 'Plasma Pink', accentColor: '#FF00FF', fileSuffix: 'plasma-pink' },
  { name: 'Golden Yellow', accentColor: '#FFD700', fileSuffix: 'golden-yellow' },
];

// Read the original noeyes.svg file
const sourcePath = path.join(__dirname, 'public', 'noeyes.svg');
const outputDir = path.join(__dirname, 'public', 'hues', 'noeyes');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Make sure the source file exists
if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

// Read the original SVG
const originalSvg = fs.readFileSync(sourcePath, 'utf8');

// Process for each theme
themes.forEach(theme => {
  let coloredSvg = originalSvg;
  
  // Replace all color values with the theme accent color
  // Looking for any fill attributes with colors in the format #XXXXXX or rgba(...) 
  coloredSvg = coloredSvg.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${theme.accentColor}"`);
  
  // Save the modified SVG to the output directory
  const outputPath = path.join(outputDir, `noeyes-${theme.fileSuffix}.svg`);
  fs.writeFileSync(outputPath, coloredSvg);
  console.log(`Generated: ${outputPath}`);
});

console.log('All SVG color variations generated successfully!'); 