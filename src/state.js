'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = '/var/lib/kubeforge';
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const KUBEFORGE_VERSION = require('../package.json').version;

function load() {
  let data;
  try {
    data = fs.readFileSync(STATE_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
  try {
    return JSON.parse(data);
  } catch (err) {
    throw new Error(`Corrupt state file: ${STATE_FILE}. Use --force to override.`);
  }
}

function save(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function markInstalled({ version, role }) {
  if (typeof version !== 'string') {
    throw new Error('markInstalled({ version, role }) requires a string version');
  }
  if (typeof role !== 'string') {
    throw new Error('markInstalled({ version, role }) requires a string role');
  }
  const existing = load();
  if (existing && existing.completed === true) {
    throw new Error('KubeForge already installed. Use --force to re-install.');
  }
  const now = new Date().toISOString();
  const state = {
    completed: true,
    kubernetesVersion: version,
    nodeRole: role,
    installedAt: now,
    updatedAt: now,
    kubeforgeVersion: KUBEFORGE_VERSION,
  };
  save(state);
}

function markUpgraded({ version }) {
  if (typeof version !== 'string') {
    throw new Error('markUpgraded({ version }) requires a string version');
  }
  const state = load();
  if (!state || !state.completed) {
    throw new Error('No completed installation found. Run kubeforge install first.');
  }
  state.kubernetesVersion = version;
  state.updatedAt = new Date().toISOString();
  state.kubeforgeVersion = KUBEFORGE_VERSION;
  save(state);
}

function isCompleted() {
  const state = load();
  return state !== null && state.completed === true;
}

function clear() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

module.exports = { load, save, markInstalled, markUpgraded, isCompleted, clear };
