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
    console.log('Click was intercepted by a browser bubble - used a DOM click instead');
    await driver.executeScript('arguments[0].click()', element);
  }
}

async function waitVisible(driver, css, timeout = 15000) {
  const el = await driver.wait(until.elementLocated(By.css(css)), timeout);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function byText(driver, tag, text, timeout = 15000) {
  const xpath = `//${tag}[normalize-space(.)='${text}']`;
  const el = await driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
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

async function readEmployeeTable(driver) {
  return withRetry(async () => {
    let rows = await driver.findElements(By.css('.oxd-table-body .oxd-table-row'));
    if (!rows.length) rows = await driver.findElements(By.css('.oxd-table-row'));

    const parsed = [];

    for (const row of rows) {
      const cells = await row.findElements(By.css('.oxd-table-cell'));
      const texts = [];
      for (const cell of cells) texts.push((await cell.getText()).trim());

      if (texts.length < 4) continue; // header row or an empty placeholder row
      if (texts[1] === 'Id') continue; // the header row's second cell is the "Id" label

      parsed.push({
        id: texts[1],
        firstName: texts[2],
        lastName: texts[3],
        name: `${texts[2]} ${texts[3]}`.replace(/\s+/g, ' ').trim(),
        text: texts.filter(Boolean).join(' | '),
      });
    }

    return parsed;
  });
}

async function waitForEmployeeRow(driver, firstName, lastName, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let rows = [];

  while (Date.now() < deadline) {
    rows = await readEmployeeTable(driver);

    const match = rows.find((row) => matchesEmployee(row, firstName, lastName));
    if (match) return { match, rows };

    await sleep(500);
  }

  return { match: null, rows };
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

    try {
      await click(driver, await byText(driver, 'a', 'Employee List'));
    } catch {
      console.log('    "Employee List" tab not found - PIM already opens the employee list');
    }

    await driver.wait(until.urlContains('/pim/viewEmployeeList'), 20000);
    check('PIM -> Employee List opens', /\/pim\/viewEmployeeList/.test(await driver.getCurrentUrl()));

    console.log(`\n[2] Searching for "${EMPLOYEE_NAME}"`);
    await withRetry(async () => {
      const nameInput = await driver.wait(
        until.elementLocated(
          By.xpath(
            "//div[contains(@class,'oxd-input-group')][.//label[contains(normalize-space(.),'Employee Name')]]//input"
          )
        ),
        15000
      );
      await nameInput.clear();
      await nameInput.sendKeys(EMPLOYEE_NAME);
    });

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
        if (text === EMPLOYEE_NAME) {
          await click(driver, option);
          console.log('    Selected the autocomplete suggestion');
          break;
        }
      }
    } catch {
    }

    console.log('\n[3] Pressing Search');
    await withRetry(async () => {
      const searchButton = await byText(driver, 'button', 'Search');
      await click(driver, searchButton);
    });
    await sleep(2000);

    console.log('\n[4] Checking the result table');
    const { match, rows } = await waitForEmployeeRow(driver, FIRST_NAME, LAST_NAME);

    console.log(`    Rows in the table: ${rows.length}`);
    if (match) console.log(`    Matching row: ${match.text}`);
    else if (rows.length) console.log(`    First rows: ${rows.slice(0, 3).map((r) => r.text).join(' || ')}`);

    check(
      'Table shows the employee',
      Boolean(match),
      match ? `name "${match.name}"` : rows.length ? `${rows.length} row(s), none matching` : 'table is empty'
    );

    console.log('\n[5] Checking the Employee Id column');
    const employeeId = match ? match.id : '';
    console.log(`    Employee Id: ${employeeId || '(empty)'}`);

    check('Employee Id column is filled', Boolean(employeeId), employeeId ? `id = ${employeeId}` : 'no id in the row');

    if (employeeId) {
      console.log(`    Employee Id looks auto-generated: ${/^\d+$/.test(employeeId) ? 'yes' : 'no (custom format)'}`);
    }
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
