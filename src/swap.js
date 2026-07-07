'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const FSTAB_PATH = '/etc/fstab';
const COMMENT_PREFIX = '# [k8s-ready] ';

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function disableSwap() {
  try {
    execSync('swapoff -a', { stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`swapoff -a failed: ${stderr}`);
  }
}

function readFstab() {
  return fs.readFileSync(FSTAB_PATH, 'utf8');
}

function commentSwapLines(content) {
  return content
    .split('\n')
    .map((line) => {
      const trimmedLeft = line.trimStart();
      if (trimmedLeft.startsWith('#')) {
        return line;
      }
      const columns = trimmedLeft.split(/\s+/);
      if (columns.length >= 3 && columns[2] === 'swap') {
        return COMMENT_PREFIX + line;
      }
      return line;
    })
    .join('\n');
}

function writeFstabWithRollback(backupPath, content) {
  try {
    fs.writeFileSync(FSTAB_PATH, content, 'utf8');
  } catch (writeErr) {
    let rollbackSucceeded = true;
    let rollbackErr = null;
    try {
      fs.copyFileSync(backupPath, FSTAB_PATH);
    } catch (e) {
      rollbackSucceeded = false;
      rollbackErr = e;
    }
    const suffix = rollbackSucceeded
      ? ` Restored ${FSTAB_PATH} from ${backupPath}.`
      : ` Rollback from ${backupPath} failed: ${rollbackErr.message}.`;
    throw new Error(`Failed to write ${FSTAB_PATH}: ${writeErr.message}.${suffix}`);
  }
}

function execute() {
  disableSwap();

  const original = readFstab();
  const modified = commentSwapLines(original);

  if (modified === original) {
    return;
  }

  const backupPath = `${FSTAB_PATH}.bak.${isoTimestamp()}`;
  fs.copyFileSync(FSTAB_PATH, backupPath);
  writeFstabWithRollback(backupPath, modified);
}

module.exports = { execute };
