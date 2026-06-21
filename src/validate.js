'use strict';

const THRESHOLDS = {
  master: { minCPU: 2, minRAM: 2, swapMustBeOff: true },
  worker: { minCPU: 1, minRAM: 1, swapMustBeOff: true },
};

function validateHardware(role, hardware) {
  const threshold = THRESHOLDS[role];
  if (!threshold) {
    throw new Error(`Unknown role: ${role}`);
  }

  const cpuPass = hardware.cpus >= threshold.minCPU;
  const ramPass = hardware.ramGB >= threshold.minRAM;
  const swapPass = threshold.swapMustBeOff ? !hardware.swapEnabled : true;

  const results = [
    {
      check: 'CPU Cores',
      current: String(hardware.cpus),
      required: `>= ${threshold.minCPU}`,
      pass: cpuPass,
    },
    {
      check: 'RAM (GB)',
      current: String(hardware.ramGB),
      required: `>= ${threshold.minRAM}`,
      pass: ramPass,
    },
    {
      check: 'Swap',
      current: hardware.swapEnabled ? 'enabled' : 'disabled',
      required: 'disabled',
      pass: swapPass,
    },
  ];

  const allPassed = results.every((r) => r.pass);

  return { results, allPassed };
}

module.exports = { validateHardware, THRESHOLDS };
