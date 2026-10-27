const { Builder, By, until } = require('selenium-webdriver');
const fs = require('fs');

async function demoblazeShop() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('https://www.demoblaze.com/');

        let laptopLink = await driver.wait(until.elementLocated(By.linkText('Laptops')), 10000);
        await laptopLink.click();

        await driver.sleep(3000); // Ootame, et tooted laadiksid AJAX päringuga
        let products = await driver.findElements(By.css('.card-title a'));

        console.log("Esimesed tooted kategoorias Laptops:");
        for (let i = 0; i < Math.min(5, products.length); i++) {
            console.log(`Toode ${i + 1}: ${await products[i].getText()}`);
        }

        let screenshot = await driver.takeScreenshot();
        fs.writeFileSync('demoblaze_laptops.png', screenshot, 'base64');
        console.log("Ekraanipilt salvestatud: demoblaze_laptops.png");
    } finally {
        await driver.quit();
    }
}

demoblazeShop();
