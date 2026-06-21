'use strict';

const https = require('https');
const readline = require('readline');

const API_URL = 'https://api.github.com/repos/kubernetes/kubernetes/releases?per_page=100';
const USER_AGENT = 'k8s-ready-installer';
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)/;

function fetchReleases() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': USER_AGENT },
    };
    const req = https.get(API_URL, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API returned HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Failed to parse GitHub API response as JSON: ${err.message}`));
        }
      });
    });
    req.on('error', (err) => {
      reject(new Error(`Network request to GitHub API failed: ${err.message}`));
    });
  });
}

function filterStableReleases(releases) {
  if (!Array.isArray(releases)) return [];
  return releases.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (r.prerelease === true) return false;
    if (r.draft === true) return false;
    if (typeof r.tag_name !== 'string') return false;
    if (/-alpha/.test(r.tag_name)) return false;
    if (/-beta/.test(r.tag_name)) return false;
    if (/-rc/.test(r.tag_name)) return false;
    return true;
  });
}

function compareSemverDesc(a, b) {
  const ax = a.replace(/^v/, '').split('.').map(Number);
  const bx = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const ai = ax[i] || 0;
    const bi = bx[i] || 0;
    if (ai !== bi) return bi - ai;
  }
  return 0;
}

function resolveLatestVersions(stableReleases) {
  if (!Array.isArray(stableReleases)) return [];
  const buckets = new Map();
  for (const r of stableReleases) {
    if (!r || typeof r.tag_name !== 'string') continue;
    const m = SEMVER_RE.exec(r.tag_name);
    if (!m) continue;
    const key = m[1] + '.' + m[2];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r.tag_name);
  }
  const latest = [];
  for (const tags of buckets.values()) {
    tags.sort(compareSemverDesc);
    latest.push(tags[0]);
  }
  latest.sort(compareSemverDesc);
  return latest.slice(0, 3);
}

async function fetchVersionChoices() {
  const releases = await fetchReleases();
  const stable = filterStableReleases(releases);
  return resolveLatestVersions(stable);
}

function selectVersion(versions) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(versions) || versions.length === 0) {
      reject(new Error('No versions available to select'));
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });
    process.stdout.write('\nSelect Kubernetes version:\n');
    for (let i = 0; i < versions.length; i++) {
      process.stdout.write(`  ${i + 1}. ${versions[i]}\n`);
    }
    rl.question(`\nEnter choice [1-${versions.length}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      const idx = parseInt(trimmed, 10);
      if (!Number.isInteger(idx) || idx < 1 || idx > versions.length) {
        reject(new Error(`Invalid selection: "${trimmed}". Please choose 1-${versions.length}.`));
        return;
      }
      resolve(versions[idx - 1]);
    });
  });
}

module.exports = { fetchVersionChoices, selectVersion };
