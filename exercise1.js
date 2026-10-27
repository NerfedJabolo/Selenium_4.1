const { Builder, By, Key, until } = require("selenium-webdriver");

async function basicSearch() {
  let driver = await new Builder().forBrowser("chrome").build();

  try {
    // Open DuckDuckGo
    await driver.get("https://www.duckduckgo.com");

    // Type 'WebDriver' into the search box and press Enter
    await driver.findElement(By.name("q")).sendKeys("WebDriver", Key.ENTER);

    // Wait for the first search result to appear
    let firstResult = await driver.wait(
      until.elementLocated(By.css("h2 a")),
      10000,
    );

    console.log("First result:", await firstResult.getText());
  } finally {
    // Close the browser
    await driver.quit();
  }
}

basicSearch();
