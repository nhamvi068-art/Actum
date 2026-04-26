const fs = require('fs');
const parser = require('@babel/parser');

let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Extract the component header (first 20 lines)
const componentHeader = lines.slice(547, 567).join('\n');
console.log('Component header (lines 548-567):');
console.log('---');
console.log(componentHeader);
console.log('---');

// Check for unusual characters
console.log('\nChecking for unusual characters in component header...');
for (let i = 0; i < componentHeader.length; i++) {
  const code2 = componentHeader.charCodeAt(i);
  // Check for unusual characters
  if (code2 > 127 && code2 < 160) {
    console.log(`Unusual char at position ${i}: ${JSON.stringify(componentHeader[i])} (${code2})`);
  }
  if (code2 === 8203 || code2 === 8204 || code2 === 8205) {
    console.log(`Zero-width char at position ${i}: ${JSON.stringify(componentHeader[i])} (${code2})`);
  }
}

// Try parsing just the component header
console.log('\nTrying to parse just the component header...');
try {
  parser.parse(componentHeader, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Component header OK');
} catch (e) {
  console.log('Component header error:', e.message);
  console.log('Location:', e.loc);
}
