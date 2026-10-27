const { Builder, By, until } = require('selenium-webdriver');
const assert = require('assert');

// --- TURVALISED ABIFUNKTSIOONID (Väldivad ajastusprobleeme) ---

async function clickElement(driver, locator, timeout = 10000) {
    let element = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(element), timeout);
    await driver.wait(until.elementIsEnabled(element), timeout);
    await element.click();
}

async function typeText(driver, locator, text, timeout = 10000) {
    let element = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(element), timeout);
    await element.clear();
    await element.sendKeys(text);
}

async function getElementText(driver, locator, timeout = 10000) {
    let element = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(element), timeout);
    return await element.getText();
}

async function runAllTests() {
    let driver = await new Builder().forBrowser('chrome').build();

    try {
        // Sisselogimise abifunktsioon
        async function login(username, password) {
            await driver.get('https://www.saucedemo.com/');
            await typeText(driver, By.id('user-name'), username);
            await typeText(driver, By.id('password'), password);
            await clickElement(driver, By.id('login-button'));
            await driver.wait(until.urlContains('/inventory.html'), 10000);
        }

        // Väljalogimise abifunktsioon
        async function logout() {
            await clickElement(driver, By.id('react-burger-menu-btn'));
            let logoutLink = await driver.wait(until.elementLocated(By.id('logout_sidebar_link')), 10000);
            await driver.wait(until.elementIsVisible(logoutLink), 10000);
            await logoutLink.click();
            await driver.wait(until.urlIs('https://www.saucedemo.com/'), 10000);
        }

        console.log('--- TEST 1: Toodete list ja korrektsed andmed ---');
        await login('standard_user', 'secret_sauce');

        // Oota, kuni tooted on laadinud
        await driver.wait(until.elementLocated(By.css('.inventory_item')), 10000);
        let items = await driver.findElements(By.css('.inventory_item'));
        assert.strictEqual(items.length, 6, 'Toodete arv peab olema täpselt 6');

        for (let item of items) {
            let name = await item.findElement(By.css('.inventory_item_name')).isDisplayed();
            let price = await item.findElement(By.css('.inventory_item_price')).isDisplayed();
            let btn = await item.findElement(By.css('button')).isDisplayed();
            assert.ok(name && price && btn, 'Igal tootel peab olema nimi, hind ja nupp');
        }
        console.log('Test 1 edukalt läbitud ✅\n');

        console.log('--- TEST 2: Toote detailvaade ja navigeerimine ---');
        await clickElement(driver, By.css('.inventory_item_name'));
        await driver.wait(until.urlContains('/inventory-item.html'), 10000);

        let detailName = await driver.findElement(By.css('.inventory_details_name')).isDisplayed();
        let detailPrice = await driver.findElement(By.css('.inventory_details_price')).isDisplayed();
        let detailBtn = await driver.findElement(By.css('.btn_inventory')).isDisplayed();
        assert.ok(detailName && detailPrice && detailBtn, 'Detailvaate elemendid peavad olema nähtavad');

        await clickElement(driver, By.id('back-to-products'));
        await driver.wait(until.urlContains('/inventory.html'), 10000);
        console.log('Test 2 edukalt läbitud ✅\n');

        console.log('--- TEST 3: Sort / Järjestamine ---');
        await clickElement(driver, By.css('.product_sort_container'));
        await clickElement(driver, By.css("option[value='hilo']")); // Price high to low

        let prices = await driver.findElements(By.css('.inventory_item_price'));
        let firstPrice = parseFloat((await prices[0].getText()).replace('$', ''));
        let secondPrice = parseFloat((await prices[1].getText()).replace('$', ''));
        assert.ok(firstPrice >= secondPrice, 'Hind peab olema kahanevas järjekorras (High to Low)');
        console.log('Test 3 edukalt läbitud ✅\n');

        console.log('--- TEST 4: Ostukorv: lisa ja eemalda tooted ---');
        let addBtns = await driver.findElements(By.css('.btn_inventory'));
        await addBtns[0].click();
        await addBtns[1].click();

        let cartBadge = await getElementText(driver, By.css('.shopping_cart_badge'));
        assert.strictEqual(cartBadge, '2', 'Ostukorvis peab olema 2 toodet');

        await clickElement(driver, By.css('.shopping_cart_link'));
        await driver.wait(until.urlContains('/cart.html'), 10000);

        let cartItems = await driver.findElements(By.css('.cart_item'));
        assert.strictEqual(cartItems.length, 2, 'Ostukorvi lehel peab olema 2 toodet');

        // Eemalda üks toode
        await clickElement(driver, By.css('.cart_item button'));
        let remainingItems = await driver.findElements(By.css('.cart_item'));
        assert.strictEqual(remainingItems.length, 1, 'Pärast eemaldamist peab alles jääma 1 toode');

        await clickElement(driver, By.id('continue-shopping'));
        await driver.wait(until.urlContains('/inventory.html'), 10000);
        console.log('Test 4 edukalt läbitud ✅\n');

        console.log('--- TEST 5: Checkout flow ---');
        await clickElement(driver, By.css('.btn_inventory')); // Lisa toode uuesti
        await clickElement(driver, By.css('.shopping_cart_link'));
        await clickElement(driver, By.id('checkout'));
        await driver.wait(until.urlContains('/checkout-step-one.html'), 10000);

        await typeText(driver, By.id('first-name'), 'Selenium');
        await typeText(driver, By.id('last-name'), 'Tester');
        await typeText(driver, By.id('postal-code'), '12345');
        await clickElement(driver, By.id('continue'));

        await driver.wait(until.urlContains('/checkout-step-two.html'), 10000);
        await clickElement(driver, By.id('finish'));

        await driver.wait(until.urlContains('/checkout-complete.html'), 10000);
        let completeHeader = await getElementText(driver, By.css('.complete-header'));
        assert.strictEqual(completeHeader, 'Thank you for your order!', 'Tellimus peab olema edukalt sooritatud');

        await clickElement(driver, By.id('back-to-products'));
        await driver.wait(until.urlContains('/inventory.html'), 10000);
        console.log('Test 5 edukalt läbitud ✅\n');

        console.log('--- TEST 6: Logout funktsionaalsus ---');
        await logout();
        let loginBtn = await driver.findElement(By.id('login-button')).isDisplayed();
        assert.ok(loginBtn, 'Peab suunama tagasi sisselogimislehele');
        console.log('Test 6 edukalt läbitud ✅\n');

        console.log('--- TEST 8: Negatiivsed & eranditega testid ---');
        // Valede andmetega sisselogimine (lukustatud kasutaja)
        await driver.get('https://www.saucedemo.com/');
        await typeText(driver, By.id('user-name'), 'locked_out_user');
        await typeText(driver, By.id('password'), 'secret_sauce');
        await clickElement(driver, By.id('login-button'));

        let errorMsg = await getElementText(driver, By.css('[data-test="error"]'));
        assert.ok(errorMsg.includes('locked out'), 'Peab kuvama lukustatud kasutaja veateadet');

        // Tühjade andmetega checkout
        await login('standard_user', 'secret_sauce');
        await clickElement(driver, By.css('.btn_inventory'));
        await clickElement(driver, By.css('.shopping_cart_link'));
        await clickElement(driver, By.id('checkout'));
        await driver.wait(until.urlContains('/checkout-step-one.html'), 10000);

        await clickElement(driver, By.id('continue')); // Täitmata väljad
        let checkoutError = await getElementText(driver, By.css('[data-test="error"]'));
        assert.ok(checkoutError.includes('First Name is required'), 'Peab kuvama veateadet puuduva nime kohta');
        console.log('Test 8 edukalt läbitud ✅\n');

        console.log('--- TEST 9: Mitme kasutajaga testid (problem_user) ---');
        await logout();
        await login('problem_user', 'secret_sauce');

        await driver.wait(until.elementLocated(By.css('.inventory_item_img img')), 10000);
        let itemImages = await driver.findElements(By.css('.inventory_item_img img'));
        let firstSrc = await itemImages[0].getAttribute('src');
        let secondSrc = await itemImages[1].getAttribute('src');
        assert.strictEqual(firstSrc, secondSrc, 'problem_user-il on teadaolevalt kõigil toodetel vigane/sama pilt');
        console.log('Test 9 edukalt läbitud ✅\n');

        console.log('--- TEST 10: Stress / hübriid test (E2E kombineeritud voog) ---');
        await logout();
        await login('standard_user', 'secret_sauce');

        // Sorteeri Z-A
        await clickElement(driver, By.css('.product_sort_container'));
        await clickElement(driver, By.css("option[value='za']"));

        // Lisa 3 toodet
        let allButtons = await driver.findElements(By.css('.btn_inventory'));
        await allButtons[0].click();
        await allButtons[1].click();
        await allButtons[2].click();

        // Ava ostukorv ja eemalda 1
        await clickElement(driver, By.css('.shopping_cart_link'));
        await driver.wait(until.urlContains('/cart.html'), 10000);
        let cartRemoveButtons = await driver.findElements(By.css('.cart_item button'));
        await cartRemoveButtons[0].click();

        // Tee checkout lõpuni
        await clickElement(driver, By.id('checkout'));
        await driver.wait(until.urlContains('/checkout-step-one.html'), 10000);
        await typeText(driver, By.id('first-name'), 'Hybrid');
        await typeText(driver, By.id('last-name'), 'User');
        await typeText(driver, By.id('postal-code'), '99999');
        await clickElement(driver, By.id('continue'));

        await driver.wait(until.urlContains('/checkout-step-two.html'), 10000);
        await clickElement(driver, By.id('finish'));
        await driver.wait(until.urlContains('/checkout-complete.html'), 10000);

        // Logi välja ja uuesti sisse
        await logout();
        await login('standard_user', 'secret_sauce');

        // Kontrolli, et ostukorv on tühi
        let cartBadges = await driver.findElements(By.css('.shopping_cart_badge'));
        assert.strictEqual(cartBadges.length, 0, 'Uuesti sisse logides peab ostukorv olema tühi');
        console.log('Test 10 edukalt läbitud ✅\n');

        console.log('KÕIK TESTID LÄBISID EDUKALT! 🎉');

    } catch (error) {
        console.error('Test kukkus läbi:', error);
    } finally {
        await driver.quit();
    }
}

runAllTests();

//testis kasutasin manuaalset tegevust, nimelt andsin chromium brauserile teada, et mind absoluutselt ei huvita fakt, et selle testimisplatvormi parool on leitud andmeleketes.
