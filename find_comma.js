const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find any trailing commas
console.log('Searching for trailing commas in destructuring patterns...');
let inDestructure = false;
let destructureStart = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect start of destructuring
  if (line.includes('const ') && (line.includes('({') || line.includes('= ({'))) {
    inDestructure = true;
    destructureStart = i;
  }

  // Detect end of destructuring
  if (inDestructure && line.trim() === '}) => {') {
    console.log(`Destructuring from line ${destructureStart + 1} to ${i + 1}`);
    // Check for trailing commas
    for (let j = destructureStart; j <= i; j++) {
      const l = lines[j];
      const trimmed = l.trim();
      if (trimmed.endsWith(',') && !trimmed.includes('=>') && !trimmed.includes('...') && !trimmed.includes('//')) {
        console.log(`  Line ${j + 1} has trailing comma: ${JSON.stringify(l)}`);
      }
    }
    inDestructure = false;
    destructureStart = -1;
  }
}

// Also check line 951 specifically
console.log('\nLine 951 (index 950):', JSON.stringify(lines[950]));
console.log('Line 952 (index 951):', JSON.stringify(lines[951]));
console.log('Line 953 (index 952):', JSON.stringify(lines[952]));
