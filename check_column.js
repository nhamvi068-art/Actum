const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Extract the component header (first 20 lines)
const componentHeader = lines.slice(547, 567).join('\n');
const headerLines = componentHeader.split('\n');

console.log('Line 20 (index 19):', JSON.stringify(headerLines[19]));
console.log('Line 20 length:', headerLines[19].length);
console.log('Char at column 46:', JSON.stringify(headerLines[19][45]));
console.log('Context around column 46:', JSON.stringify(headerLines[19].substring(30, 60)));
