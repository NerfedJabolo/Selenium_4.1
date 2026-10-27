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

const NOW = new Date();
const PICK_DAY = Math.min(12, NOW.getDate());

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

const fieldByLabel = (label) =>
  `//div[contains(@class,'oxd-input-group')][.//label[contains(normalize-space(.),'${label}')]]//input`;

async function startEditing(driver) {
  try {
    const editButton = await byText(driver, 'button', 'Edit', 5000);
    await click(driver, editButton);
    await sleep(1200);
    console.log('    Clicked Edit');
  } catch {
    console.log('    No Edit button (form is already editable)');
  }
}

async function calendarIsOpen(driver) {
  const panels = await driver.findElements(By.css('.oxd-date-input-calendar, .oxd-calendar'));
  for (const panel of panels) {
    if (await panel.isDisplayed()) return true;
  }
  return false;
}

async function openDatePicker(driver, input) {
  await click(driver, input);
  await sleep(800);
  if (await calendarIsOpen(driver)) return true;

  const icons = await driver.findElements(By.css('.oxd-input-group .oxd-date-input-icon'));
  if (icons.length) {
    await click(driver, icons[0]);
    await sleep(1000);
    if (await calendarIsOpen(driver)) return true;
  }

  return false;
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


    console.log('\n[1] Opening My Info -> Personal Details');
    await click(driver, await byText(driver, 'span', 'My Info'));
    await driver.wait(until.urlContains('/pim/viewPersonalDetails/'), 20000);
    await sleep(2000);

    const detailsUrl = await driver.getCurrentUrl();
    check('Personal Details opens', /\/pim\/viewPersonalDetails\//.test(detailsUrl));

    await startEditing(driver);


    console.log('\n[2] Opening the Date of Birth datepicker');
    const dobInput = await waitAnyLocated(driver, [
      fieldByLabel('Date of Birth'),
      'input[name="birthday"]',
    ]);
    const placeholder = await dobInput.getAttribute('placeholder');
    console.log(`    Field placeholder: "${placeholder}"`);

    const opened = await openDatePicker(driver, dobInput);
    check('Datepicker opens', opened, opened ? 'calendar visible' : 'calendar did not appear');

    if (!opened) throw new Error('The datepicker did not open');

    console.log(`\n[3] Picking day ${PICK_DAY} from the calendar`);

    const days = await driver.findElements(By.css('.oxd-calendar-date, .oxd-date-input-calendar .oxd-calendar-date'));
    let picked = false;
    for (const day of days) {
      if ((await day.getText()).trim() === String(PICK_DAY)) {
        await click(driver, day);
        picked = true;
        break;
      }
    }
    await sleep(1000);

    const pickedValue = (await dobInput.getAttribute('value')).trim();
    console.log(`    Value in the field after picking: "${pickedValue}"`);
    check('A date was picked in the calendar', picked && Boolean(pickedValue), pickedValue || 'field is empty');

    console.log('\n[4] Saving');
    await click(driver, await waitVisible(driver, 'button[type="submit"]'));
    await sleep(3000);

    console.log('\n[5] Reloading and checking the saved date');
    await driver.get(detailsUrl);
    await sleep(2500);
    await startEditing(driver);

    const dobAfter = await waitAnyLocated(driver, [fieldByLabel('Date of Birth'), 'input[name="birthday"]']);
    const savedValue = (await dobAfter.getAttribute('value')).trim();
    console.log(`    Value after reload: "${savedValue}"`);

    check('Date was saved correctly', savedValue === pickedValue && Boolean(savedValue), `expected "${pickedValue}"`);

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
