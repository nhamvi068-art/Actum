const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Extract PlaceholderOverlayInner (lines 548-914)
let lines = code.split('\n');
const component = lines.slice(547, 914).join('\n');

// Try with the div wrapper
console.log('Checking the div wrapper modification:');
const modified2 = component.replace(
  'return (\n    <React.Fragment>\n      <div\n        className={`image-placeholder',
  'return (\n    <div\n      className={`image-placeholder'
);
console.log('Modified return start:', JSON.stringify(modified2.substring(0, 100)));

// Check what's at line 365 of modified
const modLines = modified2.split('\n');
console.log('\nLine 363-368 of modified:');
for (let i = 362; i < 368; i++) {
  console.log(`  ${i+1}: ${JSON.stringify(modLines[i])}`);
}

// The error says line 365 of component (which is line 367 of modified)
// Let me check line 365 of the original component
console.log('\nLine 365 of original component:', JSON.stringify(component.split('\n')[364]));
console.log('Line 366 of original component:', JSON.stringify(component.split('\n')[365]));
console.log('Line 367 of original component:', JSON.stringify(component.split('\n')[366]));
