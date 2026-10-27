const { Builder, By } = require('selenium-webdriver');

async function addRemoveElements() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        await driver.get('https://practice.expandtesting.com/add-remove-elements');
        let addButton = await driver.findElement(By.xpath("//button[text()='Add Element']"));

        // Lisa 5 korda
        for (let i = 0; i < 5; i++) {
            await addButton.click();
        }

        let deleteButtons = await driver.findElements(By.css('.added-manually'));
        console.log(`Lisatud elemente: ${deleteButtons.length}`);

        // Kustuta ühe kaupa
        while (deleteButtons.length > 0) {
            await deleteButtons[0].click();
            deleteButtons = await driver.findElements(By.css('.added-manually'));
        }
        console.log("Kõik elemendid on edukalt kustutatud!");
    } finally {
        await driver.quit();
    }
}

addRemoveElements();
