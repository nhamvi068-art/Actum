const fs = require('fs');
let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Replace CRLF with LF
code = code.replace(/\r\n/g, '\n');
fs.writeFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', code, 'utf-8');
console.log('Converted CRLF to LF');
