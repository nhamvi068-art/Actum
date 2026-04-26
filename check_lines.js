const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

let lines = code.split('\n');
console.log('Total lines:', lines.length);
console.log('\nLine 912 (index 911):', JSON.stringify(lines[911]));
console.log('Line 913 (index 912):', JSON.stringify(lines[912]));
console.log('Line 914 (index 913):', JSON.stringify(lines[913]));
console.log('Line 915 (index 914):', JSON.stringify(lines[914]));
