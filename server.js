const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Function to fetch HTML with Puppeteer
async function fetchHTMLWithPuppeteer(url, timeout = 120000) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    const html = await page.content();
    await browser.close();
    return html;
  } catch (error) {
    console.error(`Error fetching HTML for ${url}: ${error.message}`);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Function to extract links with Puppeteer
async function extractLinksWithPuppeteer(url, timeout = 120000, retries = 3) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(anchor => anchor.href)
        .filter(href => href.startsWith('http'));
    });

    await browser.close();
    return [...new Set(links)];
  } catch (error) {
    console.error(`Error extracting links from ${url}: ${error.message}`);
    if (retries > 0) {
      console.log(`Retrying (${retries} attempts left) for ${url}`);
      return extractLinksWithPuppeteer(url, timeout, retries - 1);
    }
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Function to fetch HTML with axios and cheerio for initial level
async function fetchHTMLWithAxios(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching HTML for ${url} with axios: ${error.message}`);
    throw error;
  }
}

// Function to extract links with cheerio for initial level
function extractLinksWithCheerio(html) {
  const $ = cheerio.load(html);
  return Array.from($('a'))
    .map(anchor => $(anchor).attr('href'))
    .filter(href => href && href.startsWith('http'));
}

// Function to crawl URLs up to a certain depth
async function crawl(url, depth, currentDepth = 1) {
  if (currentDepth > depth) return [];

  try {
    console.log(`Crawling ${url} at depth ${currentDepth}`);
    let links = [];

    if (currentDepth === 1) {
      const html = await fetchHTMLWithAxios(url);
      links = extractLinksWithCheerio(html);
    } else {
      links = await extractLinksWithPuppeteer(url);
    }

    const linkCount = links.length;
    const results = [{ pageUrl: url, links, linkCount, depth: currentDepth }];

    if (currentDepth < depth) {
      for (const link of links) {
        const nestedResults = await crawl(link, depth, currentDepth + 1);
        results.push(...nestedResults);
      }
    }

    return results;
  } catch (error) {
    console.error(`Error during crawl of ${url} at depth ${currentDepth}: ${error.message}`);
    return [{ pageUrl: url, links: [], linkCount: 0, depth: currentDepth, error: error.message }];
  }
}

app.post('/check-links', async (req, res) => {
  const { urls, depth } = req.body;
  const results = [];

  console.log(`Starting link check for ${urls.length} URLs with depth ${depth}`);

  for (const url of urls) {
    try {
      const pageResults = await crawl(url, depth);
      results.push(...pageResults);
    } catch (error) {
      console.error(`Error processing URL ${url}: ${error.message}`);
      results.push({ pageUrl: url, error: error.message, links: [], linkCount: 0, depth: 0 });
    }
  }

  console.log('Link check completed.');
  res.json(results);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

