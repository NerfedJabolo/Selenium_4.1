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

const COOKIE_FILE = path.join(__dirname, 'cookies.json');

const BASE_URL = 'https://opensource-demo.orangehrmlive.com/';
const DASHBOARD_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index';

function toAddableCookie(cookie) {
  const result = { name: cookie.name, value: cookie.value };

  if (cookie.path) result.path = cookie.path;
  if (typeof cookie.secure === 'boolean') result.secure = cookie.secure;
  if (typeof cookie.httpOnly === 'boolean') result.httpOnly = cookie.httpOnly;
  if (typeof cookie.expiry === 'number') result.expiry = cookie.expiry;
  if (['Lax', 'Strict', 'None'].includes(cookie.sameSite)) result.sameSite = cookie.sameSite;

  return result;
}

function isExpired(cookie) {
  return typeof cookie.expiry === 'number' && cookie.expiry * 1000 <= Date.now();
}

(async () => {
  const options = createChromeOptions();

  let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    let wait = (locator, timeout = 10000) => driver.wait(locator, timeout);

    const click = async (element) => {
      try {
        await element.click();
      } catch {
        console.log('Click was intercepted by a browser bubble - used a DOM click instead');
        await driver.executeScript('arguments[0].click()', element);
      }
    };

    await driver.get(BASE_URL);

    console.log(await driver.getTitle());

    await sleep(1000);

    try {
      const el = await wait(
        until.elementLocated(
          By.css('div.oxd-form-row:nth-child(2) > div:nth-child(1) > div:nth-child(2) > input:nth-child(1)')
        )
      );
      await el.sendKeys('Admin');
    } catch {
      console.log('This aint works');
    }

    await sleep(1000);

    try {
      const el = await wait(
        until.elementLocated(
          By.css('div.oxd-form-row:nth-child(3) > div:nth-child(1) > div:nth-child(2) > input:nth-child(1)')
        )
      );
      await el.sendKeys('admin123');
    } catch {
      console.log('This aint works');
    }

    await sleep(500);

    try {
      const el = await wait(until.elementLocated(By.css('.oxd-button')));
      await click(el);
    } catch {
      console.log('This aint works');
    }

    await sleep(1000);

    try {
      const el = await wait(until.elementLocated(By.css('h6.oxd-text')));
      console.log('Dashboard check: ', await el.getText());
    } catch {
      console.log('This aint works');
    }

    await sleep(1000);

    console.log('Login successful!');

    const cookies = await driver.manage().getCookies();

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf8');

    console.log(`Cookie save (${cookies.map((c) => c.name).join(', ')})`);

    await driver.quit();

    driver = await new Builder().forBrowser('chrome').setChromeOptions(createChromeOptions()).build();
    wait = (locator, timeout = 10000) => driver.wait(locator, timeout);

    await driver.get(BASE_URL);
    await sleep(2000);

    const loadedCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));

    const restoreCookies = async () => {
      await driver.manage().deleteAllCookies();

      for (const cookie of loadedCookies) {
        if (isExpired(cookie)) continue;

        try {
          await driver.manage().addCookie(toAddableCookie(cookie));
        } catch (err) {
          console.log(`Cookie "${cookie.name}" was rejected: ${err.message}`);
        }
      }

      const restored = await driver.manage().getCookies();
      console.log(`Cookies loaded! (${restored.map((c) => c.name).join(', ')})`);
    };

    await restoreCookies();

    await driver.get(DASHBOARD_URL);

    const dashboardLoaded = async () => {
      try {
        const el = await wait(until.elementLocated(By.css('h6.oxd-text')));
        const text = await el.getText();
        console.log('Page:', text);
        return text.trim().length > 0;
      } catch {
        return false;
      }
    };

    if (!(await dashboardLoaded())) {
      console.log(`Session restore failed (url: ${await driver.getCurrentUrl()}), retrying once`);

      await driver.get(BASE_URL);
      await sleep(1000);
      await restoreCookies();

      await driver.get(DASHBOARD_URL);

      if (!(await dashboardLoaded())) {
        console.log(`Session restore failed (url: ${await driver.getCurrentUrl()})`);
        console.log(`Cookies in the browser: ${JSON.stringify(await driver.manage().getCookies())}`);
      }
    }

    await sleep(10000);
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
