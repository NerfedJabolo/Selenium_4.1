const { Builder, By, until } = require('selenium-webdriver');
const fs = require('fs');

async function parabankRegister() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        // 1. Ava Parabank
        await driver.get('https://parabank.parasoft.com/parabank/index.htm');

        // 3. Klõpsa lingil "Register"
        let registerLink = await driver.wait(until.elementLocated(By.linkText('Register')), 10000);
        await registerLink.click();

        // 6. Täida väljad
        await driver.wait(until.elementLocated(By.id('customer.firstName')), 5000);
        await driver.findElement(By.id('customer.firstName')).sendKeys('Selenium');
        await driver.findElement(By.id('customer.lastName')).sendKeys('User');
        await driver.findElement(By.id('customer.address.street')).sendKeys('123 Test Street');
        await driver.findElement(By.id('customer.address.city')).sendKeys('Testville');
        await driver.findElement(By.id('customer.address.state')).sendKeys('TestState');
        await driver.findElement(By.id('customer.address.zipCode')).sendKeys('12345');
        await driver.findElement(By.id('customer.phoneNumber')).sendKeys('123-456-7890');
        await driver.findElement(By.id('customer.ssn')).sendKeys('123-45-6789');
        await driver.findElement(By.id('customer.username')).sendKeys('seleniumuser');
        await driver.findElement(By.id('customer.password')).sendKeys('TestPassword123');
        await driver.findElement(By.id('repeatedPassword')).sendKeys('TestPassword123');

        // 7. Klõpsa nuppu "Register" (kasutades <input type="submit" value="Register"> või üldist submit nuppu)
        await driver.findElement(By.css("input[value='Register']")).click();

        // 9. Oota, kuni ilmub edukas sõnum
        let successMsg = await driver.wait(
            until.elementLocated(By.xpath("//p[contains(text(), 'Your account was created successfully')]")),
            10000
        );
        console.log("Sõnum:", await successMsg.getText());

        // 11. Klõpsa lingil "Accounts Overview"
        let accountsOverview = await driver.wait(until.elementLocated(By.linkText('Accounts Overview')), 5000);
        await accountsOverview.click();

        // 13. Tee ekraanipilt
        await driver.sleep(2000); // Ootame lehe laadimist
        let screenshot = await driver.takeScreenshot();
        fs.writeFileSync('parabank_accounts.png', screenshot, 'base64');
        console.log("Ekraanipilt salvestatud: parabank_accounts.png");

    } finally {
        // 15. Sulge brauser
        await driver.quit();
    }
}

parabankRegister();
