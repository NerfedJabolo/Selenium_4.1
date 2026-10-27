const { Builder, By, Key } = require('selenium-webdriver');

async function fillForm() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('https://www.w3schools.com/html/html_forms.asp');

        await driver.findElement(By.id('fname')).sendKeys('Sten');
        await driver.findElement(By.id('lname')).sendKeys('Kahu');
        await driver.findElement(By.css("input[type='submit'][value='Submit']")).click();

        console.log("Vorm on täidetud ja esitatud!");
    } finally {
        await driver.quit();
    }
}

fillForm();
