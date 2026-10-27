// Ülesanne 4 – CREATE: Lisa uus töötaja (create a new employee)
//
// Steps from the task description:
//   1. Log in as Admin.
//   2. Go to PIM -> Add Employee.
//   3. Fill the fields: First Name = Test, Last Name = User123,
//      Employee Id = leave it empty/automatic, and upload a JPG/PNG photo.
//   4. Save.
//   5. Check that the Personal Details page opens.
//   6. Check that the employee name is displayed correctly.
//
// Run: node yle4.js
//
// The photo is `photo.png` next to this script (a 240x240 PNG). The Employee Id field is never
// touched, so OrangeHRM generates it; the generated value is printed after saving.
'use strict';

const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome's password-manager UI - the "password found in a data breach" warning and the
// "Save password?" bubble - is browser chrome, NOT page DOM. It cannot be found with a CSS
// selector, and it can sit on top of the form and swallow clicks. Switch it off up front.
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
const FULL_NAME = `${FIRST_NAME} ${LAST_NAME}`;

const PHOTO_FILE = path.join(__dirname, 'photo.png');

const results = [];

function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`);
}

// Click, but never let a browser bubble break the step: if the real click is intercepted
// (a warning bubble covering the element), fall back to a DOM click, which ignores overlays.
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

// Waits for the first of several selectors, so a markup change in one place does not break it.
async function waitAnyVisible(driver, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const found = await driver.findElements(
        selector.startsWith('//') ? By.xpath(selector) : By.css(selector)
      );
      if (found.length && (await found[0].isDisplayed())) return found[0];
    }
    await sleep(250);
  }

  throw new Error(`None of these selectors became visible: ${selectors.join(' | ')}`);
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

// ---------------------------------------------------------------------------------------------
// The employee photo. OrangeHRM renders a plain <input type="file"> in the .orangehrm-employee-image
// block (no crop dialog), which is filled with the form and uploaded together with the employee.
// ---------------------------------------------------------------------------------------------

// Waits until one of the selectors matches an element in the DOM. Unlike waitAnyVisible() this
// does not require the element to be visible - needed for <input type="file">, which OrangeHRM
// hides behind the photo area (isDisplayed() is false for it, yet sendKeys() must reach it).
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

async function debugPhotoArea(driver) {
  try {
    const info = await driver.executeScript(
      `const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
       const box = document.querySelector('.orangehrm-employee-image');
       return {
         fileInputs: inputs.map((el) => ({ class: el.className, display: getComputedStyle(el).display })),
         photoArea: box ? box.outerHTML.slice(0, 240) : null
       };`
    );
    console.log(`    debug: ${JSON.stringify(info)}`);
  } catch {
    // diagnostics only - never fail the run because of them
  }
}

async function uploadPhoto(driver, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`    WARNING: ${filePath} not found - no photo will be uploaded`);
    return false;
  }

  let fileInput;
  try {
    fileInput = await waitAnyLocated(driver, [
      '.orangehrm-employee-image input[type="file"]',
      '.oxd-file-div input[type="file"]',
      'input[type="file"]',
    ]);
  } catch (err) {
    await debugPhotoArea(driver);
    throw err;
  }

  await driver.executeScript(
    'arguments[0].style.display = "block"; arguments[0].style.visibility = "visible"; arguments[0].style.opacity = 1;',
    fileInput
  );

  await fileInput.sendKeys(filePath);
  await sleep(1000);

  const preview = await driver.findElements(By.css('.orangehrm-employee-image img'));
  const previewSrc = preview.length ? await preview[0].getAttribute('src') : '';
  const previewed = /^data:image\//.test(previewSrc) || !/default-photo/.test(previewSrc);
  console.log(`    Photo input filled - preview updated: ${previewed}`);

  return true;
}

async function readEmployeeId(driver) {
  const inputs = await driver.findElements(
    By.xpath(
      "//div[contains(@class,'oxd-input-group')][.//label[contains(normalize-space(.),'Employee Id')]]//input"
    )
  );

  if (!inputs.length) return '';

  return (await inputs[0].getAttribute('value')).trim();
}


(async () => {
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(createChromeOptions())
    .build();

  try {
    console.log('\n[1] Logging in as Admin');
    await login(driver, ADMIN_USER, ADMIN_PASS);
    check('Admin login works', /\/dashboard\//.test(await driver.getCurrentUrl()));

    console.log('\n[2] Opening PIM -> Add Employee');
    await click(driver, await byText(driver, 'span', 'PIM'));
    await driver.wait(until.urlContains('/pim/'), 20000);

    try {
      await click(driver, await byText(driver, 'a', 'Add Employee'));
    } catch {
      console.log('    "Add Employee" tab not found - using the Add button of the employee list');
      await click(driver, await byText(driver, 'button', 'Add'));
    }

    await driver.wait(until.urlContains('/pim/addEmployee'), 20000);
    check('PIM -> Add Employee opens', /\/pim\/addEmployee/.test(await driver.getCurrentUrl()), await driver.getCurrentUrl());

    console.log('\n[3] Filling the Add Employee form');
    const firstName = await waitAnyVisible(driver, ['input[name="firstName"]', '.orangehrm-firstname']);
    await firstName.clear();
    await firstName.sendKeys(FIRST_NAME);

    const lastName = await waitAnyVisible(driver, ['input[name="lastName"]', '.orangehrm-lastname']);
    await lastName.clear();
    await lastName.sendKeys(LAST_NAME);


    let photoState = 'skipped';
    try {
      photoState = (await uploadPhoto(driver, PHOTO_FILE)) ? 'uploaded' : 'skipped';
    } catch (err) {
      photoState = 'failed';
      console.log(`    Photo upload failed: ${String(err.message).split('\n')[0]}`);
    }
    console.log(`    Name: ${FULL_NAME} | photo: ${photoState === 'uploaded' ? path.basename(PHOTO_FILE) : photoState}`);

    console.log('\n[4] Saving');
    const saveButton = await waitVisible(driver, 'button[type="submit"]');
    await click(driver, saveButton);

    console.log('\n[5] Checking that the Personal Details page opened');
    await driver.wait(until.urlContains('/pim/viewPersonalDetails/'), 25000);
    await sleep(1000);

    const url = await driver.getCurrentUrl();
    check('Personal Details page opens', /\/pim\/viewPersonalDetails\//.test(url), url);

    console.log('\n[6] Checking the displayed employee name');
    const nameElement = await waitAnyVisible(driver, ['.orangehrm-edit-employee-name', 'h6.oxd-text']);
    const displayedName = (await nameElement.getText()).trim().replace(/\s+/g, ' ');

    console.log(`    Displayed name: "${displayedName}" (expected "${FULL_NAME}")`);
    check('Employee name is displayed correctly', displayedName === FULL_NAME);

    const employeeId = await readEmployeeId(driver);
    console.log(`    Generated Employee Id: ${employeeId || '(not readable)'}`);

    const photos = await driver.findElements(
      By.css('.orangehrm-edit-employee-image-wrapper img, img.employee-image')
    );
    const photoSrc = photos.length ? await photos[0].getAttribute('src') : '';
    const hasCustomPhoto = Boolean(photoSrc) && (/^data:image\//.test(photoSrc) || !/default-photo/.test(photoSrc));

    check(
      'Employee photo was attached',
      hasCustomPhoto,
      photoState === 'uploaded'
        ? /^data:image\//.test(photoSrc)
          ? 'custom photo shown'
          : photoSrc
        : `photo not submitted (${photoState})`
    );

    const failed = results.filter((r) => !r.ok);
    console.log('\n---');
    console.log(`Employee created: ${FULL_NAME} (${url})`);
    console.log(`Summary: ${results.length - failed.length}/${results.length} checks passed`);
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
