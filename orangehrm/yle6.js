'use strict';

const { Builder, By, until, Key } = require('selenium-webdriver');
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
const MIDDLE_NAME = 'QA';
const NICKNAME = 'Automation';

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

function skip(label, detail) {
  console.log(`SKIP  ${label} -> ${detail}`);
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

async function waitAnyLocated(driver, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const found = await driver.findElements(
        selector.startsWith('//') ? By.xpath(selector) : By.css(selector)
      );
      if (found.length) return found[0];
    }
    await sleep(250);
  }
  throw new Error(`None of these selectors were found in the DOM: ${selectors.join(' | ')}`);
}

async function byText(driver, tag, text, timeout = 15000) {
  const el = await driver.wait(
    until.elementLocated(By.xpath(`//${tag}[normalize-space(.)='${text}']`)),
    timeout
  );
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

async function exists(driver, selectors, timeout = 4000) {
  try {
    return await waitAnyLocated(driver, selectors, timeout);
  } catch {
    return null;
  }
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
      // free text search works as well
    }

    await click(driver, await byText(driver, 'button', 'Search'));
    await sleep(2000);

    const deadline = Date.now() + 15000;
    let rows = [];
    while (Date.now() < deadline) {
      rows = await readRows(driver);
      if (rows.some((r) => matchesEmployee(r, FIRST_NAME, LAST_NAME))) return rows;
      await sleep(500);
    }
    return rows;
  });
}

async function openPersonalDetails(driver, name) {
  await withRetry(async () => {
    const rows = await searchEmployee(driver, name);
    const match = rows.find((r) => matchesEmployee(r, FIRST_NAME, LAST_NAME));

    if (!match) {
      const seen = rows.map((r) => r.name).join(', ') || 'no rows';
      throw new Error(
        `Employee "${FIRST_NAME} ${LAST_NAME}" was not found in the result table (found: ${seen}). Run yle4.js first.`
      );
    }

    // The name cell is a link to the employee's Personal Details page.
    const link = await match.row.findElements(By.css('.oxd-table-cell a'));
    if (link.length) await click(driver, link[0]);
    else await click(driver, match.row);

    await driver.wait(until.urlContains('/pim/viewPersonalDetails/'), 20000);
    await sleep(1500);
  });
}
async function startEditing(driver) {
  let found = true;
  try {
    await byText(driver, 'button', 'Edit', 5000);
  } catch {
    found = false;
  }

  if (!found) {
    console.log('    No Edit button - this version keeps the form editable directly');
    return;
  }

  await withRetry(async () => {
    const editButton = await byText(driver, 'button', 'Edit', 5000);
    await click(driver, editButton);
  });
  await sleep(1000);
  console.log('    Clicked Edit');
}

const fieldByLabel = (label) =>
  `//div[contains(@class,'oxd-input-group')][.//label[contains(normalize-space(.),'${label}')]]//input`;

async function typeInto(driver, selectors, value, label) {
  const attempts = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const el = await withRetry(async () => {
      const field = await waitAnyLocated(driver, selectors, 8000);
      await click(driver, field);
      return field;
    });

    await el.sendKeys(Key.chord(Key.CONTROL, 'a'));
    await el.sendKeys(Key.BACK_SPACE);

    if ((await el.getAttribute('value')).trim()) {
      await driver.executeScript(
        "arguments[0].value = ''; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));",
        el
      );
    }

    await el.sendKeys(value);

    const after = (await el.getAttribute('value')).trim();
    if (after === value) return;

    attempts.push(`attempt ${attempt + 1} -> "${after}"`);
    await sleep(700);
  }

  throw new Error(`${label} could not be set to "${value}" (${attempts.join(', ')})`);
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

    console.log(`\n[1] Open "${EMPLOYEE_NAME}" -> Personal Details`);
    await click(driver, await byText(driver, 'span', 'PIM'));
    await driver.wait(until.urlContains('/pim/'), 20000);
    await openPersonalDetails(driver, EMPLOYEE_NAME);

    const detailsUrl = await driver.getCurrentUrl();
    console.log(`    ${detailsUrl}`);
    check('Employee detail view opens', /\/pim\/viewPersonalDetails\//.test(detailsUrl));

    console.log('\n[2] Pressing Edit');
    await startEditing(driver);

    console.log('\n[3] Changing the fields');
    await typeInto(
      driver,
      ['input[name="middleName"]', '.orangehrm-middlename', fieldByLabel('Middle Name')],
      MIDDLE_NAME,
      'Middle Name'
    );
    console.log(`    Middle Name = ${MIDDLE_NAME}`);

    const nickExists = await exists(driver, [fieldByLabel('Nickname'), fieldByLabel('Nick Name')], 4000);
    let nicknameAttempted = false;
    if (nickExists) {
      await typeInto(driver, [fieldByLabel('Nickname'), fieldByLabel('Nick Name')], NICKNAME, 'Nickname');
      nicknameAttempted = true;
      console.log(`    Nickname = ${NICKNAME}`);
    } else {
      console.log('    Nickname field not rendered on this instance');
    }

    console.log('\n[4] Saving');
    await click(driver, await waitVisible(driver, 'button[type="submit"]'));
    await sleep(3000);

    console.log('\n[5] Reloading the page and checking the saved values');
    await driver.get(detailsUrl);
    await sleep(2500);
    await startEditing(driver);

    const middleValue = await withRetry(async () => {
      const middleAfter = await waitAnyLocated(
        driver,
        ['input[name="middleName"]', '.orangehrm-middlename', fieldByLabel('Middle Name')],
        8000
      );
      return (await middleAfter.getAttribute('value')).trim();
    });
    console.log(`    Middle Name after reload: "${middleValue}"`);
    check('Middle Name was saved', middleValue === MIDDLE_NAME, `expected "${MIDDLE_NAME}"`);

    if (nicknameAttempted) {
      const nickValue = await withRetry(async () => {
        const nickAfter = await waitAnyLocated(driver, [fieldByLabel('Nickname'), fieldByLabel('Nick Name')], 5000);
        return (await nickAfter.getAttribute('value')).trim();
      });
      console.log(`    Nickname after reload: "${nickValue}"`);
      check('Nickname was saved', nickValue === NICKNAME, `expected "${NICKNAME}"`);
    } else {
      skip(
        'Nickname was saved',
        'field not available (enable "Show Nick Name, Smoker and Military Service in Personal Details" in Admin -> Configuration -> Optional Fields)'
      );
    }

    const headerText = await withRetry(async () => {
      const header = await waitAnyLocated(driver, ['.orangehrm-edit-employee-name'], 5000);
      return (await header.getText()).trim().replace(/\s+/g, ' ');
    });
    console.log(`    Header name: "${headerText}" (the header does not include the middle name)`);
    check('Employee name header is intact', headerText === EMPLOYEE_NAME, `expected "${EMPLOYEE_NAME}"`);

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
