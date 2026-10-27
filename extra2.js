const { Builder, By, until } = require('selenium-webdriver');

async function sauceDemoLogin() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('https://www.saucedemo.com/');

        await driver.findElement(By.id('user-name')).sendKeys('standard_user');
        await driver.findElement(By.id('password')).sendKeys('secret_sauce');
        await driver.findElement(By.id('login-button')).click();

        await driver.wait(until.urlContains('inventory.html'), 5000);

        let productNames = await driver.findElements(By.className('inventory_item_name'));
        console.log("Toodete nimed:");
        for (let prod of productNames) {
            console.log("-", await prod.getText());
        }
    } finally {
        await driver.quit();
    }
}

sauceDemoLogin();
