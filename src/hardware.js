'use strict';

const os = require('os');
const fs = require('fs');

function detectHardware() {
  const cpus = os.cpus().length;
  const ramGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const swapEnabled = detectSwap();

  return { cpus, ramGB, swapEnabled };
}

function detectSwap() {
  try {
    const content = fs.readFileSync('/proc/swaps', 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1 && lines[0].trim() === '') {
      return false;
    }
    const dataLines = lines.slice(1).filter((line) => line.trim() !== '');
    return dataLines.length > 0;
  } catch (err) {
    process.stdout.write('Warning: Cannot read /proc/swaps — assuming swap is enabled\n');
    return true;
  }
}

module.exports = { detectHardware };
