
'use strict';

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createChromeOptions() {
  const options = new chrome.Options();

  options.addArguments(
    '--disable-features=PasswordLeakDetection,PasswordManagerRedesign,BulkPasswordLeakCheck,PasswordChangeSupport,AutofillServerCommunication',
    '--disable-save-password-bubble',
    '--password-store=basic'
  );

  options.setUserPreferences({
    credentials_enable_service: false,
    'profile.password_manager_enabled': false,
    'profile.password_manager_leak_detection': false,
  });

  return options;
}

const BASE_URL = 'https://opensource-demo.orangehrmlive.com';
const LOGIN_URL = `${BASE_URL}/web/index.php/auth/login`;
const EMPLOYEE_LIST_URL = `${BASE_URL}/web/index.php/pim/viewEmployeeList`;

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'admin123';

const FIRST_NAME = 'Test';
const LAST_NAME = 'User123';
const EMPLOYEE_NAME = `${FIRST_NAME} ${LAST_NAME}`;

function matchesEmployee(row, firstName, lastName) {
  const first = String(row.firstName ?? '').trim();
  const last = String(row.lastName ?? '').trim();
  return (first === firstName || first.startsWith(`${firstName} `)) && last === lastName;
}

const results = [];

function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
}

async function click(driver, element) {
  try {
    await element.click();
  } catch {
    console.log('Click was intercepted - used a DOM click instead');
    await driver.executeScript('arguments[0].click()', element);
  }
}

async function waitVisible(driver, css, timeout = 15000) {
  const el = await driver.wait(until.elementLocated(By.css(css)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function byText(driver, tag, text, timeout = 15000) {
  const el = await driver.wait(
    until.elementLocated(By.xpath(`//${tag}[normalize-space(.)='${text}']`)),
    timeout
  );
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function login(driver, username, password) {
  await driver.get(LOGIN_URL);

  const userInput = await waitVisible(driver, 'input[name="username"]');
  await userInput.clear();
  await userInput.sendKeys(username);

  const passInput = await waitVisible(driver, 'input[name="password"]');
  await passInput.clear();
  await passInput.sendKeys(password);

  await click(driver, await waitVisible(driver, 'button[type="submit"]'));

  await driver.wait(until.urlContains('/dashboard/'), 20000);
  await waitVisible(driver, 'h6.oxd-text');
}

function isStale(err) {
  return /stale element|not attached to the page document|no such element|Node with given id|detached/i.test(
    String(err && err.message ? err.message : err)
  );
}

async function withRetry(fn, attempts = 4, delay = 600) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isStale(err)) throw err;
      await sleep(delay);
    }
  }

  throw lastError;
}

async function readRows(driver) {
  return withRetry(async () => {
    let rows = await driver.findElements(By.css('.oxd-table-body .oxd-table-row'));
    if (!rows.length) rows = await driver.findElements(By.css('.oxd-table-row'));

    const parsed = [];
    for (const row of rows) {
      const cells = await row.findElements(By.css('.oxd-table-cell'));
      const texts = [];
      for (const cell of cells) texts.push((await cell.getText()).trim());
      if (texts.length < 4 || texts[1] === 'Id') continue;

      parsed.push({
        row,
        checkbox: (await row.findElements(By.css('input[type="checkbox"]')))[0] || null,
        id: texts[1],
        firstName: texts[2],
        lastName: texts[3],
        name: `${texts[2]} ${texts[3]}`.replace(/\s+/g, ' ').trim(),
      });
    }
    return parsed;
  });
}

async function searchEmployee(driver, name) {
  return withRetry(async () => {
    const nameInput = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//div[contains(@class,'oxd-input-group')][.//label[contains(normalize-space(.),'Employee Name')]]//input"
        )
      ),
      15000
    );
    await nameInput.clear();
    await nameInput.sendKeys(name);

    await sleep(1500);
    try {
      const options = await driver.findElements(By.css('.oxd-autocomplete-option'));
      for (const option of options) {
        let text = '';
        try {
          text = (await option.getText()).trim().replace(/\s+/g, ' ');
        } catch {
          continue;
        }
        if (text === name) {
          await click(driver, option);
          break;
        }
      }
    } catch {
    }

    await click(driver, await byText(driver, 'button', 'Search'));
    await sleep(2500);

    return readRows(driver);
  });
}

async function deleteMatchingEmployees(driver, name) {
  const rows = await searchEmployee(driver, name);
  const matches = rows.filter((r) => matchesEmployee(r, FIRST_NAME, LAST_NAME));

  console.log(`    ${rows.length} row(s) in the table, ${matches.length} matching "${name}"`);
  if (!matches.length) return 0;

  for (const match of matches) {
    if (!match.checkbox) {
      console.log(`    Row ${match.id} has no checkbox - skipped`);
      continue;
    }
    await withRetry(async () => {
      const fresh = (await readRows(driver)).find((r) => r.id === match.id);
      if (!fresh || !fresh.checkbox) throw new Error(`Row ${match.id} disappeared from the table`);
      await driver.executeScript('arguments[0].click()', fresh.checkbox);
    });
    console.log(`    Ticked row ${match.id}`);
  }
  await withRetry(async () => {
    await click(driver, await byText(driver, 'button', 'Delete Selected'));
  });

  // Confirmation dialog.
  await driver.wait(until.elementLocated(By.css('.oxd-dialog-container, .oxd-dialog-sheet, [role="dialog"]')), 10000);
  await sleep(500);

  await withRetry(async () => {
    const confirm = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//div[contains(@class,'oxd-dialog') or @role='dialog']//button[normalize-space(.)='Yes, Delete']"
        )
      ),
      10000
    );
    await click(driver, confirm);
  });
  await sleep(3000);

  return matches.length;
}

(async () => {
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(createChromeOptions())
    .build();

  try {

    console.log('\n[0] Logging in as Admin');
    await login(driver, ADMIN_USER, ADMIN_PASS);
    check('Admin login works', /\/dashboard\//.test(await driver.getCurrentUrl()));


    console.log('\n[1] Opening PIM -> Employee List');
    await click(driver, await byText(driver, 'span', 'PIM'));
    await driver.wait(until.urlContains('/pim/'), 20000);
    await driver.wait(until.urlContains('/pim/viewEmployeeList'), 20000);
    check('Employee List opens', /\/pim\/viewEmployeeList/.test(await driver.getCurrentUrl()));


    console.log(`\n[2-4] Searching "${EMPLOYEE_NAME}", ticking and deleting`);
    const deleted = await deleteMatchingEmployees(driver, EMPLOYEE_NAME);
    check('Employee(s) selected and deleted', deleted > 0, `${deleted} record(s) deleted`);


    console.log('\n[5] Searching again - the employee must be gone');
    await driver.get(EMPLOYEE_LIST_URL);
    await sleep(2000);

    const remaining = (await searchEmployee(driver, EMPLOYEE_NAME)).filter((r) =>
      matchesEmployee(r, FIRST_NAME, LAST_NAME)
    );
    console.log(`    Rows matching "${EMPLOYEE_NAME}" after delete: ${remaining.length}`);
    if (remaining.length) console.log(`    Still there: ${remaining.map((r) => `${r.id} ${r.name}`).join(', ')}`);

    check('Employee is no longer in the search results', remaining.length === 0);


    const failed = results.filter((r) => !r.ok);
    console.log(`\nSummary: ${results.length - failed.length}/${results.length} checks passed`);
    for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` (${f.detail})` : ''}`);

    process.exitCode = failed.length ? 1 : 0;
  } catch (err) {
    console.log(`\nUnexpected error: ${String(err.message).split('\n')[0]}`);
    process.exitCode = 1;
  } finally {
    try {
      await driver.quit();
    } catch {
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
