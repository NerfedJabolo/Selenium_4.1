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

async function errorMessagesFor(driver, inputName) {
  const groups = await driver.findElements(
    By.xpath(`//input[@name='${inputName}']/ancestor::div[contains(@class,'oxd-input-group')][1]`)
  );
  if (!groups.length) return [];

  const messages = await groups[0].findElements(By.css('.oxd-input-field-error-message'));
  const texts = [];
  for (const message of messages) texts.push((await message.getText()).trim());
  return texts.filter(Boolean);
}

async function allErrorMessages(driver) {
  const messages = await driver.findElements(By.css('.oxd-input-field-error-message'));
  const texts = [];
  for (const message of messages) {
    const text = (await message.getText()).trim();
    if (text) texts.push(text);
  }
  return texts;
}

async function waitForValidationErrors(driver, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let messages = [];

  while (Date.now() < deadline) {
    messages = await allErrorMessages(driver);
    if (messages.length >= 2) return messages;
    await sleep(250);
  }
  return messages;
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


    console.log('\n[1] Opening PIM -> Add Employee');
    await click(driver, await byText(driver, 'span', 'PIM'));
    await driver.wait(until.urlContains('/pim/'), 20000);

    try {
      await click(driver, await byText(driver, 'a', 'Add Employee'));
    } catch {
      await click(driver, await byText(driver, 'button', 'Add'));
    }

    await driver.wait(until.urlContains('/pim/addEmployee'), 20000);
    await waitVisible(driver, 'input[name="firstName"]');
    check('Add Employee form opens', /\/pim\/addEmployee/.test(await driver.getCurrentUrl()));


    console.log('\n[2] Leaving the required fields empty');

    console.log('\n[3] Pressing Save');
    await click(driver, await waitVisible(driver, 'button[type="submit"]'));
    await sleep(1500);

    const errors = await waitForValidationErrors(driver);
    console.log(`    Error messages on the form: ${errors.length ? errors.join(', ') : '(none)'}`);

    console.log('\n[4] Checking the "Required" messages');

    const firstErrors = await errorMessagesFor(driver, 'firstName');
    const lastErrors = await errorMessagesFor(driver, 'lastName');

    console.log(`    First Name: ${firstErrors.join(', ') || '(none)'}`);
    console.log(`    Last Name:  ${lastErrors.join(', ') || '(none)'}`);

    check('"Required" is shown at First Name', firstErrors.includes('Required'), firstErrors.join(', ') || 'no message');
    check('"Required" is shown at Last Name', lastErrors.includes('Required'), lastErrors.join(', ') || 'no message');

    const stillOnForm = /\/pim\/addEmployee/.test(await driver.getCurrentUrl());
    check('The form was not submitted (still on Add Employee)', stillOnForm, await driver.getCurrentUrl());

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
