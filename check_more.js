const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

let lines = code.split('\n');
console.log('Total lines:', lines.length);
console.log('\nLine 910 (index 909):', JSON.stringify(lines[909]));
console.log('Line 911 (index 910):', JSON.stringify(lines[910]));
console.log('Line 912 (index 911):', JSON.stringify(lines[911]));
console.log('Line 913 (index 912):', JSON.stringify(lines[912]));
console.log('Line 914 (index 913):', JSON.stringify(lines[913]));
console.log('Line 915 (index 914):', JSON.stringify(lines[914]));
console.log('Line 916 (index 915):', JSON.stringify(lines[915]));

// Character codes for line 912
console.log('\nLine 912 char codes:', Array.from(lines[911]).map(c => c.charCodeAt(0)));
