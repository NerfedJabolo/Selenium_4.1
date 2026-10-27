const { Builder, By, until } = require('selenium-webdriver');
const assert = require('assert');
const { setTimeout } = require('timers');

async function runSauceDemoTests() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        console.log("--- 1. Toodete listi kontroll ---");
        await driver.get('https://www.saucedemo.com/');

        // Login
        await driver.findElement(By.id('user-name')).sendKeys('standard_user');
        await driver.findElement(By.id('password')).sendKeys('secret_sauce');
        await driver.findElement(By.id('login-button')).click();

        await driver.wait(until.urlContains('inventory.html'), 5000);

        // Kontrolli, et tooteid on õige arv (SauceDemo-s peaks olema 6 toodet)
      setTimeout(() => {}, 1000)
        let items = await driver.findElements(By.className('inventory_item'));
        console.log(`Leitud toodete arv: ${items.length}`);
        assert.strictEqual(items.length, 6, "Toodete arv peaks olema 6!");

        // Kontrolli, et igal tootel on nimi, hind ja 'Add to cart' nupp
        for (let item of items) {
            let name = await item.findElement(By.className('inventory_item_name')).getText();
            let price = await item.findElement(By.className('inventory_item_price')).getText();
            let btn = await item.findElement(By.css('button.btn_inventory')).getText();
            console.log(`Toode: ${name} | Hind: ${price} | Nupp: ${btn}`);
        }

        console.log("\n--- 2. Toote detailvaade ja navigeerimine ---");
        // 1. Leia kõik toodete lingid
                let productLinks = await driver.findElements(By.css("a[data-test$='-title-link']"));

                // Vali soovitud toote indeks (nt 1 - teine toode)
                let targetIndex = 0;
                let selectedLink = productLinks[targetIndex];
                let expectedProductName = await selectedLink.getText();

                // 2. Võta elemendi ID atribuut (nt "item_4_title_link")
                let elementId = await selectedLink.getAttribute('id');

                // 3. Eralda stringist number ( regex "\d+" leiab esimese numbrijada tekstist )
                let match = elementId.match(/\d+/);
                let productId = match ? match[0] : null;

                console.log(`Leitud toode: "${expectedProductName}", ID on: ${productId}`);

                // 4. Mine otse URL-ile, kasutades leitud ID-d
                let targetUrl = `https://www.saucedemo.com/inventory-item.html?id=${productId}`;
                await driver.get(targetUrl);

                // 5. Kontrolli, et detailvaade avanes edukalt
                let detailNameElement = await driver.wait(
                    until.elementLocated(By.css("div[data-test='inventory-item-name']")),
                    5000
                );
                let detailName = await detailNameElement.getText();

                assert.strictEqual(detailName, expectedProductName, "Toote nimi detailvaates peab klappima!");
                console.log(`Oled edukalt toote detailvaates (URL-i kaudu): ${detailName}`);

                // 6. Mine tagasi toodete nimekirja
                await driver.findElement(By.id("back-to-products")).click();
                await driver.wait(until.elementLocated(By.css("div[data-test='inventory-list']")), 5000);

        console.log("\n--- 4. Ostukorv: lisa ja eemalda tooted ---");
        // Lisa esimesed 2 toodet ostukorvi
        let addButtons = await driver.findElements(By.css('button.btn_inventory'));
        await addButtons[0].click(); // Lisa toode 1
        await addButtons[1].click(); // Lisa toode 2

        // Kontrolli ostukorvi märgist (badge)
        let cartBadge = await driver.findElement(By.className('shopping_cart_badge'));
        console.log(`Ostukorvis esemete arv: ${await cartBadge.getText()}`);

        // Ava ostukorv
        await driver.findElement(By.className('shopping_cart_link')).click();
        await driver.wait(until.urlContains('cart.html'), 5000);

        let cartItems = await driver.findElements(By.className('cart_item'));
        assert.strictEqual(cartItems.length, 2, "Ostukorvis peaks olema 2 toodet!");

        // Eemalda üks toode ostukorvist
        await driver.findElement(By.css('.cart_item:first-child button.cart_button')).click();
        cartItems = await driver.findElements(By.className('cart_item'));
        assert.strictEqual(cartItems.length, 1, "Pärast eemaldamist peaks ostukorvis olema 1 toode!");
        console.log("Toode edukalt ostukorvist eemaldatud!");

        console.log("\n--- 5. Checkout flow (tellimuse vormistamine) ---");
        await driver.findElement(By.id('checkout')).click();
        await driver.wait(until.urlContains('checkout-step-one.html'), 5000);

        // Täida andmed
        await driver.findElement(By.id('first-name')).sendKeys('Selenium');
        await driver.findElement(By.id('last-name')).sendKeys('Tester');
        await driver.findElement(By.id('postal-code')).sendKeys('12345');
        await driver.findElement(By.id('continue')).click();

        await driver.wait(until.urlContains('checkout-step-two.html'), 5000);
        // Lõpeta ost
        await driver.findElement(By.id('finish')).click();

        await driver.wait(until.urlContains('checkout-complete.html'), 5000);
        let successHeader = await driver.findElement(By.className('complete-header')).getText();
        console.log(`Tellimuse staatus: ${successHeader}`);

        console.log("\n--- 6. Logout funktsionaalsus ---");
        // Ava vasak menüü
        await driver.findElement(By.id('react-burger-menu-btn')).click();
        // Oota, kuni logout link on nähtav ja klõpsa seda
        let logoutLink = await driver.wait(until.elementLocated(By.id('logout_sidebar_link')), 5000);
        await driver.sleep(1000); // Väike paus menüü animatsiooni jaoks
        await logoutLink.click();

        await driver.wait(until.urlIs('https://www.saucedemo.com/'), 5000);
        console.log("Edukalt välja logitud, suunatud tagasi avalehele.");

        console.log("\n--- 8. Negatiivne test (valed andmed) ---");
        await driver.findElement(By.id('user-name')).sendKeys('locked_out_user');
        await driver.findElement(By.id('password')).sendKeys('secret_sauce');
        await driver.findElement(By.id('login-button')).click();

        let errorMsg = await driver.findElement(By.css('h3[data-test="error"]')).getText();
        console.log(`Oodatud veateade lukustatud kasutajalt: "${errorMsg}"`);

        console.log("\nKõik SauceDemo testid läbitud edukalt!");
    } finally {
        await driver.quit();
    }
}

runSauceDemoTests();
