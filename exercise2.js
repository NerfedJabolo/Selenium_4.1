const { Builder, By, Key, until } = require("selenium-webdriver");

async function basicSearch() {
  let driver = await new Builder().forBrowser("chrome").build();

  try {
    // Open DuckDuckGo
    await driver.get("https://en.wikipedia.org/wiki/Selenium_%28software%29");

    console.log(await driver.getTitle());
  } finally {
    // Close the browser
    await driver.quit();
  }
}

basicSearch();
