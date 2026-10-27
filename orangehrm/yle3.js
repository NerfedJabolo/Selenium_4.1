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
const LOGOUT_URL = `${BASE_URL}/web/index.php/auth/logout`;
const SYSTEM_USERS_URL = `${BASE_URL}/web/index.php/admin/viewSystemUsers`;

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'admin123';

const ESS_USER = process.env.ESS_USER || '';
const ESS_PASS = process.env.ESS_PASS || 'admin123';

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

async function bodyText(driver) {
  try {
    const body = await driver.findElement(By.css('body'));
    return (await body.getText()).trim();
  } catch {
    return '';
  }
}

async function hasLoginForm(driver, timeout = 3000) {
  try {
    await driver.wait(until.elementLocated(By.css('input[name="username"]')), timeout);
    return true;
  } catch {
    return false;
  }
}

async function login(driver, username, password) {
  await driver.get(LOGIN_URL);

  if (!(await hasLoginForm(driver))) {
    console.log('    A session is still active - logging out first');
    await driver.get(LOGOUT_URL);
    await driver.get(LOGIN_URL);
  }

  const userInput = await waitVisible(driver, 'input[name="username"]');
  await userInput.clear();
  await userInput.sendKeys(username);

  const passInput = await waitVisible(driver, 'input[name="password"]');
  await passInput.clear();
  await passInput.sendKeys(password);

  const submit = await waitVisible(driver, 'button[type="submit"]');
  await click(driver, submit);

  await driver.wait(until.urlContains('/dashboard/'), 20000);
  await waitVisible(driver, 'h6.oxd-text');
}

async function logout(driver) {
  const dropdown = await waitVisible(driver, '.oxd-userdropdown-tab');
  await click(driver, dropdown);

  const logoutLink = await driver.wait(
    until.elementLocated(By.xpath("//a[contains(@class,'oxd-userdropdown-link') and normalize-space(.)='Logout']")),
    10000
  );
  await click(driver, logoutLink);

  await driver.wait(until.urlContains('/auth/login'), 20000);
}

async function api(driver, method, apiPath, payload) {
  const cookies = await driver.manage().getCookies();
  const res = await fetch(`${BASE_URL}/web/index.php/api/v2/${apiPath}`, {
    method,
    headers: {
      accept: 'application/json',
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
  }

  return { status: res.status, data, text };
}

async function pickUnlinkedEmployee(driver) {
  const usersRes = await api(driver, 'GET', 'admin/users?limit=200&offset=0');
  const linked = new Set(
    (usersRes.data?.data ?? []).map((user) => user.employee?.empNumber).filter((n) => n !== undefined)
  );

  const empRes = await api(driver, 'GET', 'pim/employees?limit=20&offset=0');
  const employees = empRes.data?.data ?? [];

  return employees.find((employee) => !linked.has(employee.empNumber)) ?? employees[0] ?? null;
}

async function createTemporaryEssUser(driver, password) {
  const employee = await pickUnlinkedEmployee(driver);
  if (!employee) throw new Error('No employee found to attach the ESS user to');

  const username = `qa_task3_${Date.now()}`;

  const res = await api(driver, 'POST', 'admin/users', {
    userRoleId: 2, // 1 = Admin, 2 = ESS
    empNumber: employee.empNumber,
    status: true,
    username,
    password,
  });

  const id = res.data?.data?.id;
  if (res.status !== 200 || !id) {
    throw new Error(`Could not create the ESS user (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
  }

  const name = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');
  console.log(`    Temporary ESS user created: ${username} / ${password} (employee: ${name})`);

  return { id, username, password, employeeName: name };
}

async function deleteUser(driver, id) {
  return api(driver, 'DELETE', 'admin/users', { ids: [id] });
}

async function findAddUserButton(driver) {
  const buttons = await driver.findElements(By.css('button'));
  for (const button of buttons) {
    const text = (await button.getText()).trim();
    if (/^(?:\+\s*)?add(?:\s+user)?$/i.test(text)) return { button, text };
  }
  return null;
}

async function mainMenuItems(driver) {
  let items = await driver.findElements(By.css('li.oxd-main-menu-item-wrapper span.oxd-main-menu-item--name'));
  if (!items.length) items = await driver.findElements(By.css('a.oxd-main-menu-item'));

  const texts = [];
  for (const item of items) texts.push((await item.getText()).trim());
  return texts.filter(Boolean);
}


(async () => {
  if (typeof fetch !== 'function') {
    console.error('Node 18 or newer is required (global fetch is used for account setup).');
    process.exit(1);
  }

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(createChromeOptions())
    .build();

  let tempUser = null;
  let crashed = false;

  try {
    console.log('\n[1] Logging in as Admin');
    await login(driver, ADMIN_USER, ADMIN_PASS);
    const dashboardTitle = await (await driver.findElement(By.css('h6.oxd-text'))).getText();
    console.log(`    Logged in, page title: ${dashboardTitle}`);
    check('Admin login works', /\/dashboard\//.test(await driver.getCurrentUrl()));

    console.log('\n[2] Opening Admin -> User Management');
    const adminMenu = await driver.wait(
      until.elementLocated(By.xpath("//span[contains(@class,'oxd-main-menu-item--name') and normalize-space(.)='Admin']")),
      15000
    );
    await click(driver, adminMenu);
    await driver.wait(until.urlContains('/admin/viewSystemUsers'), 20000);
    await waitVisible(driver, 'h6.oxd-text');

    check('Admin -> User Management opens', /\/admin\/viewSystemUsers/.test(await driver.getCurrentUrl()), await driver.getCurrentUrl());

    console.log('\n[3] Checking the "Add User" button');
    const addButton = await findAddUserButton(driver);
    check(
      '"Add User" button exists for Admin',
      Boolean(addButton),
      addButton ? `button text: "${addButton.text}"` : 'button not found'
    );

    let essUser = ESS_USER;
    let essPass = ESS_PASS;

    if (!essUser) {
      console.log('\n[setup] No ESS_USER given - creating a temporary ESS account');
      tempUser = await createTemporaryEssUser(driver, essPass);
      essUser = tempUser.username;
      essPass = tempUser.password;
    } else {
      console.log(`\n[setup] Using the supplied ESS account: ${essUser}`);
    }

    console.log('\n[4] Logging out');
    await logout(driver);
    check('Logout returns to the login page', /\/auth\/login/.test(await driver.getCurrentUrl()));

    console.log(`\n[5] Logging in as ESS user "${essUser}"`);
    let essLoggedIn = true;
    try {
      await login(driver, essUser, essPass);
    } catch (err) {
      essLoggedIn = false;
      console.log(`    ESS login failed: ${String(err.message).split('\n')[0]}`);
      console.log('    Set ESS_USER / ESS_PASS to an existing employee account and run again.');
    }
    check('ESS login works', essLoggedIn, await driver.getCurrentUrl());

    if (essLoggedIn) {
      console.log('\n[6] Checking that the Admin / User Management menu is hidden');
      const menu = await mainMenuItems(driver);
      console.log(`    Visible menu: ${menu.join(', ') || '(none)'}`);

      const adminMenuVisible = menu.some((item) => /^admin$/i.test(item));
      check('Admin menu is NOT visible for ESS', menu.length > 0 && !adminMenuVisible);

      console.log(`\n[7] Opening ${SYSTEM_USERS_URL.replace(BASE_URL, '')} as ESS`);
      await driver.get(SYSTEM_USERS_URL);
      await sleep(4000);

      const url = await driver.getCurrentUrl();
      const text = await bodyText(driver);
      const addButtonForEss = await findAddUserButton(driver);

      const redirected = /\/dashboard\//.test(url);
      const deniedMessage = /access denied|credential required|not authori[sz]ed|forbidden|403/i.test(text);
      const accessGranted = Boolean(addButtonForEss);

      console.log(`    URL: ${url}`);
      console.log(`    Visible text: ${text ? JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 160)) : '(page is empty)'}`);

      if (accessGranted) {
        check('System Users is blocked for ESS', false, 'User Management page and its Add button are reachable');
      } else if (redirected) {
        check('System Users is blocked for ESS', true, 'redirected to the Dashboard');
      } else if (deniedMessage) {
        check('System Users is blocked for ESS', true, '"Access denied" page');
      } else {
        check('System Users is blocked for ESS', true, 'no User Management UI rendered (server returned 403)');
      }
    }

  } catch (err) {
    crashed = true;
    console.log(`\nUnexpected error: ${String(err.message).split('\n')[0]}`);
  } finally {
    if (tempUser) {
      console.log('\n[cleanup] Logging back in as Admin to delete the temporary ESS user');
      try {
        await login(driver, ADMIN_USER, ADMIN_PASS);
        const del = await deleteUser(driver, tempUser.id);
        console.log(
          del.status === 200
            ? `    Temporary user ${tempUser.username} deleted`
            : `    Could not delete ${tempUser.username} (HTTP ${del.status})`
        );
      } catch (err) {
        console.log(`    Cleanup failed: ${String(err.message).split('\n')[0]}`);
        console.log(`    Delete "${tempUser.username}" manually in Admin -> User Management.`);
      }
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\nSummary: ${results.length - failed.length}/${results.length} checks passed`);
    for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
    if (crashed) console.log('  FAILED: the script stopped early (see the error above)');

    process.exitCode = crashed || failed.length ? 1 : 0;

    try {
      await driver.quit();
    } catch {
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
