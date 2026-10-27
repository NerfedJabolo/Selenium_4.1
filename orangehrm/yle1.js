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

(async () => {
  const options = createChromeOptions();

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    const wait = (locator, timeout = 10000) => driver.wait(locator, timeout);

    const click = async (element) => {
      try {
        await element.click();
      } catch {
        console.log('Click was intercepted by a browser bubble - used a DOM click instead');
        await driver.executeScript('arguments[0].click()', element);
      }
    };

    await driver.get('https://opensource-demo.orangehrmlive.com/');

    console.log(await driver.getTitle());

    try {
      const el = await wait(
        until.elementLocated(
          By.css('div.oxd-form-row:nth-child(2) > div:nth-child(1) > div:nth-child(2) > input:nth-child(1)')
        )
      );
      await el.sendKeys('bulls');
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
      await el.sendKeys('bulls');
    } catch {
      console.log('This aint works');
    }

    await sleep(1000);

    try {
      const el = await wait(until.elementLocated(By.css('.oxd-button')));
      await click(el);
    } catch {
      console.log('This aint works');
    }

    await sleep(1000);

    try {
      const el = await wait(until.elementLocated(By.css('.oxd-alert-content')));
      console.log('Error check: ', await el.getText());
    } catch {
      console.log('This aint works');
    }

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

    await sleep(15000);
  } finally {
    await driver.quit();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
