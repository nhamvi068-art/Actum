const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Extract PlaceholderOverlayInner (lines 548-914)
let lines = code.split('\n');
const component = lines.slice(547, 914).join('\n');

// Check around line 367 of component (line 914 of file)
const compLines = component.split('\n');
console.log('Line 365-370 of component:');
for (let i = 364; i < 370; i++) {
  console.log(`  ${i+1}: ${JSON.stringify(compLines[i])}`);
}

// Now let's check the return statement inside useEffect
console.log('\nLooking for useEffect return...');
const useEffectStart = component.indexOf('useEffect(');
if (useEffectStart !== -1) {
  const useEffectSnippet = component.substring(useEffectStart, useEffectStart + 500);
  console.log('useEffect snippet:', JSON.stringify(useEffectSnippet));
}
