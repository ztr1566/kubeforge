'use strict';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function pad(str, width) {
  const s = String(str);
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function printReport(role, validationResult) {
  const { results, allPassed } = validationResult;

  const colWidths = { check: 14, current: 12, required: 12, status: 8 };
  const header = `${pad('Check', colWidths.check)}${pad('Current', colWidths.current)}${pad('Required', colWidths.required)}${pad('Status', colWidths.status)}`;
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${'-'.repeat(colWidths.check + colWidths.current + colWidths.required + colWidths.status)}\n`);

  for (const r of results) {
    const mark = r.pass ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
    const statusCol = r.pass ? `${GREEN}${pad('✔', colWidths.status)}${RESET}` : `${RED}${pad('✘', colWidths.status)}${RESET}`;
    process.stdout.write(`${pad(r.check, colWidths.check)}${pad(r.current, colWidths.current)}${pad(r.required, colWidths.required)}${statusCol}\n`);
  }

  process.stdout.write('\n');
  if (allPassed) {
    process.stdout.write(`${GREEN}✔ System is compatible for ${role} node${RESET}\n`);
  } else {
    process.stdout.write(`${RED}✘ System does NOT meet requirements for ${role} node${RESET}\n`);
  }
}

module.exports = { printReport };
