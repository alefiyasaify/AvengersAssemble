// Copies the defect categories into allure-results so the report groups failures sensibly.
const fs = require('node:fs');
const path = require('node:path');
const results = path.resolve(__dirname, '..', 'allure-results');
fs.mkdirSync(results, { recursive: true });
fs.copyFileSync(path.resolve(__dirname, '..', 'allure', 'categories.json'), path.join(results, 'categories.json'));
console.log('categories.json copied to allure-results');
