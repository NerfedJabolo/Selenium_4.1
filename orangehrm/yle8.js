
'use strict';

const fs = require('fs');
const path = require('path');
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

const UPLOAD_FILE = path.join(__dirname, 'cv.pdf');
const COMMENT = 'Test upload';

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


async function tabTexts(driver) {
  let links = await driver.findElements(By.css('.oxd-topbar-body-nav-tab-link'));
  if (!links.length) links = await driver.findElements(By.css('.oxd-topbar-body-nav-tab a'));

  const texts = [];
  for (const link of links) texts.push((await link.getText()).trim());
  return texts.filter(Boolean);
}

async function openTab(driver, label) {
  try {
    const link = await driver.wait(
      until.elementLocated(By.xpath(`//a[normalize-space(.)='${label}']`)),
      5000
    );
    await click(driver, link);
    await sleep(1500);
    return true;
  } catch {

  }

  console.log(`    Available tabs: ${(await tabTexts(driver)).join(', ') || '(none found)'}`);
  return false;
}

async function openAttachmentsSection(driver) {
  const addButton = await driver
    .wait(
      until.elementLocated(
        By.xpath("//div[contains(@class,'orangehrm-attachment')]//button[normalize-space(.)='Add']")
      ),
      12000
    )
    .catch(() => null);

  if (addButton) return { addButton, mode: 'block on the page' };

  if (await openTab(driver, 'Attachments')) {
    const button = await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space(.)='Add']")),
      10000
    );
    return { addButton: button, mode: 'tab' };
  }

  throw new Error('Attachments section not found - neither the block on the page nor a tab');
}

async function attachmentField(driver, scopedXPath, fallbackCss, timeout = 10000) {
  try {
    return await driver.wait(until.elementLocated(By.xpath(scopedXPath)), timeout);
  } catch {
    return await driver.wait(until.elementLocated(By.css(fallbackCss)), timeout);
  }
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
      if (!texts.filter(Boolean).length) continue;

      parsed.push({ text: texts.filter(Boolean).join(' | '), cells: texts });
    }
    return parsed;
  });
}

async function waitForFileRow(driver, fileName, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let rows = [];

  while (Date.now() < deadline) {
    rows = await readRows(driver);
    const match = rows.find((row) => row.text.includes(fileName));
    if (match) return { match, rows };
    await sleep(500);
  }
  return { match: null, rows };
}


(async () => {
  if (!fs.existsSync(UPLOAD_FILE)) {
    console.error(`Upload file not found: ${UPLOAD_FILE}`);
    process.exit(1);
  }

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(createChromeOptions())
    .build();

  try {
    console.log('\n[0] Logging in as Admin');
    await login(driver, ADMIN_USER, ADMIN_PASS);
    check('Admin login works', /\/dashboard\//.test(await driver.getCurrentUrl()));

    console.log('\n[1] Opening My Info -> Attachments');
    await click(driver, await byText(driver, 'span', 'My Info'));
    await driver.wait(until.urlContains('/pim/viewPersonalDetails/'), 20000);
    await sleep(2500);

    const attachments = await openAttachmentsSection(driver);
    console.log(`    Attachments found as: ${attachments.mode}`);
    check('Attachments section is available', Boolean(attachments.addButton), attachments.mode);

    console.log('\n[2] Pressing Add');
    await click(driver, attachments.addButton);
    await sleep(2000);

    console.log(`\n[3] Uploading ${path.basename(UPLOAD_FILE)}`);
    await withRetry(async () => {
      const fileInput = await attachmentField(
        driver,
        "//div[contains(@class,'orangehrm-attachment')]//input[@type='file']",
        'input[type="file"]'
      );

      await driver.executeScript(
        'arguments[0].style.display = "block"; arguments[0].style.visibility = "visible"; arguments[0].style.opacity = 1;',
        fileInput
      );
      await fileInput.sendKeys(UPLOAD_FILE);
    });
    await sleep(1000);
    console.log('    File selected');

    console.log(`\n[4] Adding the comment "${COMMENT}"`);
    await withRetry(async () => {
      const comment = await attachmentField(
        driver,
        "//div[contains(@class,'orangehrm-attachment')]//textarea",
        'textarea'
      );
      await comment.clear();
      await comment.sendKeys(COMMENT);
    });

    console.log('\n[5] Saving');
    await withRetry(async () => {
      const save = await attachmentField(
        driver,
        "//div[contains(@class,'orangehrm-attachment')]//button[normalize-space(.)='Save']",
        'button[type="submit"]'
      );
      await click(driver, save);
    });
    await sleep(3000);

    console.log('\n[6] Checking the attachments table');
    const { match, rows } = await waitForFileRow(driver, path.basename(UPLOAD_FILE));

    console.log(`    Rows in the table: ${rows.length}`);
    if (match) console.log(`    Matching row: ${match.text}`);
    else if (rows.length) console.log(`    First rows: ${rows.slice(0, 3).map((r) => r.text).join(' || ')}`);

    check(
      'File appears in the attachments table',
      Boolean(match),
      match ? path.basename(UPLOAD_FILE) : `${rows.length} row(s), file not found`
    );
    check('Comment was saved with the attachment', Boolean(match) && match.text.includes(COMMENT), COMMENT);

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
