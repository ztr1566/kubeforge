'use strict';

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const KEYRINGS_DIR = '/etc/apt/keyrings';
const KEYRING_PATH = '/etc/apt/keyrings/kubernetes-apt-keyring.gpg';
const SOURCES_LIST_PATH = '/etc/apt/sources.list.d/kubernetes.list';
const USER_AGENT = 'k8s-ready-installer';
const MAJOR_MINOR_RE = /^v?(\d+)\.(\d+)(?:\.\d+.*)?$/;
const MAX_REDIRECTS = 5;

function ensureKeyringsDir() {
  fs.mkdirSync(KEYRINGS_DIR, { recursive: true });
}

function fetchGpgKey(url, depth) {
  depth = depth || 0;
  if (depth > MAX_REDIRECTS) {
    return Promise.reject(new Error('Exceeded maximum redirect limit of ' + MAX_REDIRECTS + ' starting at ' + url));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers && res.headers.location;
        res.resume();
        if (!location) {
          reject(new Error('GPG key fetch returned HTTP ' + res.statusCode + ' with no Location header for ' + url));
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(location, url).toString();
        } catch (err) {
          reject(new Error('Invalid redirect Location header "' + location + '" for ' + url + ': ' + err.message));
          return;
        }
        resolve(fetchGpgKey(nextUrl, depth + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error('GPG key fetch returned HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(new Error('GPG key stream error: ' + err.message)));
    });
    req.on('error', (err) => reject(new Error('GPG key network request failed: ' + err.message)));
  });
}

async function downloadGpgKey(majorMinor) {
  const url = 'https://pkgs.k8s.io/core:/stable:/v' + majorMinor + '/deb/Release.key';
  const keyData = await fetchGpgKey(url, 0);
  try {
    execSync('gpg --dearmor -o ' + KEYRING_PATH, {
      input: keyData,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error('gpg --dearmor failed: ' + stderr);
  }
}

function writeSourcesList(majorMinor) {
  const content = 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v' + majorMinor + '/deb/ /\n';
  fs.writeFileSync(SOURCES_LIST_PATH, content, 'utf8');
}

function extractMajorMinor(version) {
  if (typeof version !== 'string') {
    throw new Error('Invalid version: expected string, got ' + typeof version);
  }
  const m = MAJOR_MINOR_RE.exec(version.trim());
  if (!m) {
    throw new Error('Could not extract major.minor from version string: "' + version + '"');
  }
  return m[1] + '.' + m[2];
}

async function execute(opts) {
  if (!opts || typeof opts.version !== 'string') {
    throw new Error('execute({ version }) requires a string version');
  }
  const majorMinor = extractMajorMinor(opts.version);
  ensureKeyringsDir();
  await downloadGpgKey(majorMinor);
  writeSourcesList(majorMinor);
}

module.exports = { execute };
