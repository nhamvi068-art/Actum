const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

let lines = code.split('\n');
console.log('Total lines:', lines.length);
console.log('\nLine 780-785:');
for (let i = 779; i < 785; i++) {
  console.log(`  Line ${i+1}: ${JSON.stringify(lines[i])}`);
}
