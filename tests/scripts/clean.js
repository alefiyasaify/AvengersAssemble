const fs = require('node:fs');
for (const dir of ['allure-results', 'allure-report', 'playwright-report', 'test-results', 'logs']) {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('cleaned');
