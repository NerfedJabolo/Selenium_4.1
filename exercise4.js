const { Builder, By, Key, until } = require('selenium-webdriver');
const fs = require('fs');

async function multiResultAndScreenshot() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('https://www.duckduckgo.com');
        await driver.findElement(By.name('q')).sendKeys('Selenium WebDriver', Key.ENTER);

        await driver.wait(until.elementLocated(By.css('h2 a')), 10000);
        let results = await driver.findElements(By.css('h2 a'));

        console.log("Esimesed 3 tulemust:");
        for (let i = 0; i < Math.min(3, results.length); i++) {
            console.log(`${i + 1}: ${await results[i].getText()}`);
        }

        let screenshot = await driver.takeScreenshot();
        fs.writeFileSync('duckduckgo_results.png', screenshot, 'base64');
        console.log("Ekraanipilt salvestatud: duckduckgo_results.png");
    } finally {
        await driver.quit();
    }
}

multiResultAndScreenshot();
