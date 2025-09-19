
const { spawn } = require('child_process');

// Use npx on Windows as npx.cmd; run via shell on Windows to avoid spawn EINVAL
const isWin = process.platform === 'win32';
const command = isWin ? 'npx.cmd' : 'npx';
const args = ['serve', '-s', 'build/', '-l', '3001', '--single'];

console.log('Spawning:', command, args.join(' '));

// Use shell on Windows to properly execute .cmd files
const child = spawn(command + ' ' + args.join(' '), { stdio: 'inherit', shell: isWin });

child.on('close', (code) => {
  console.log('serve exited with code', code);
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start serve:', err);
  process.exit(1);
});
