import { runAppleScript } from "run-applescript";

// Maximum number of top results to scrape
const MAX_RESULTS = 3;

// Constants for Safari management
const TIMEOUT = 10000; // 10 seconds
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * Performs a Google search and scrapes results
 * @param query - The search query
 * @param numResults - Maximum number of results to return (default: 3)
 * @returns Object with search results and content from top pages
 */
async function performSearch(
  query: string,
  numResults: number = MAX_RESULTS,
): Promise<{
  searchResults: string[];
  detailedContent: { url: string; title: string; content: string }[];
}> {
  try {
    await openSafariWithTimeout();
    await setUserAgent(USER_AGENT);

    // Do Google search
    const encodedQuery = encodeURIComponent(query);
    await navigateToUrl(`https://www.google.com/search?q=${encodedQuery}`);
    await wait(2); // Wait for page to load

    // Extract search results
    const results = await extractSearchResults(numResults);

    if (!results || results.length === 0) {
      return {
        searchResults: ["No search results found."],
        detailedContent: [],
      };
    }

    // Visit top results and scrape their content
    const detailedContent = await scrapeTopResults(results, numResults);

    return {
      searchResults: results.map((r) => `${r.title}\n${r.url}`),
      detailedContent,
    };
  } catch (error) {
    console.error("Error in search:", error);
    return {
      searchResults: [
        `Error performing search: ${error instanceof Error ? error.message : String(error)}`,
      ],
      detailedContent: [],
    };
  } finally {
    // Clean up: close Safari
    try {
      await closeSafari();
    } catch (closeError) {
      console.error("Error closing Safari:", closeError);
    }
  }
}

/**
 * Opens Safari with a timeout
 */
async function openSafariWithTimeout(): Promise<string | void> {
  return Promise.race([
    runAppleScript(`
      tell application "Safari"
        activate
        make new document
        set bounds of window 1 to {100, 100, 1200, 900}
      end tell
    `),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout opening Safari")), TIMEOUT),
    ),
  ]);
}

/**
 * Sets the user agent in Safari
 */
async function setUserAgent(userAgent: string): Promise<void> {
  await runAppleScript(`
    tell application "Safari"
      set the user agent of document 1 to "${userAgent.replace(/"/g, '\\"')}"
    end tell
  `);
}

/**
 * Navigates Safari to a URL
 */
async function navigateToUrl(url: string): Promise<void> {
  await runAppleScript(`
    tell application "Safari"
      set URL of document 1 to "${url.replace(/"/g, '\\"')}"
    end tell
  `);
}

/**
 * Waits for specified number of seconds
 */
async function wait(seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Extracts search results from Google
 */
async function extractSearchResults(
  numResults: number,
): Promise<Array<{ title: string; url: string }>> {
  const jsScript = `
    const results = [];
    const elements = Array.from(document.querySelectorAll('div.g, div[data-sokoban-container]')).slice(0, ${numResults});

    for (const el of elements) {
      try {
        const titleElement = el.querySelector('h3');
        const linkElement = el.querySelector('a');

        if (titleElement && linkElement) {
          const title = titleElement.textContent;
          const href = linkElement.href;

          if (title && href && href.startsWith('http') && !href.includes('google.com/search')) {
            results.push({
              title: title,
              url: href
            });
          }
        }
      } catch (e) {
        console.error('Error parsing result:', e);
      }
    }

    return JSON.stringify(results);
  `;

  const resultString = await runAppleScript(`
    tell application "Safari"
      set jsResult to do JavaScript "${jsScript.replace(/"/g, '\\"').replace(/\n/g, " ")}" in document 1
      return jsResult
    end tell
  `);

  try {
    return JSON.parse(resultString);
  } catch (error) {
    console.error("Error parsing search results:", error);
    console.error("Raw result:", resultString);
    return [];
  }
}

/**
 * Scrapes content from top search results
 */
async function scrapeTopResults(
  results: Array<{ title: string; url: string }>,
  maxResults: number,
): Promise<Array<{ url: string; title: string; content: string }>> {
  const detailedContent = [];

  for (let i = 0; i < Math.min(results.length, maxResults); i++) {
    const result = results[i];

    try {
      // Navigate to the page
      await navigateToUrl(result.url);
      await wait(3); // Allow page to load

      // Extract the main content
      const content = await extractPageContent();

      detailedContent.push({
        url: result.url,
        title: result.title,
        content,
      });
    } catch (error) {
      console.error(`Error scraping ${result.url}:`, error);
      detailedContent.push({
        url: result.url,
        title: result.title,
        content: `Error extracting content: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return detailedContent;
}

/**
 * Extracts main content from the current page
 */
async function extractPageContent(): Promise<string> {
  const jsScript = `
    function extractMainContent() {
      // Try to find the main content using common selectors
      const selectors = [
        'main', 'article', '[role="main"]', '.main-content', '#content', '.content',
        '.post-content', '.entry-content', '.article-content'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.length > 200) {
          return element.textContent.trim();
        }
      }

      // Fall back to looking for the largest text block
      let largestElement = null;
      let largestSize = 0;

      const textBlocks = document.querySelectorAll('p, div > p, section, article, div.content, div.article');
      let combinedText = '';

      for (const block of textBlocks) {
        const text = block.textContent.trim();
        if (text.length > 50) {
          combinedText += text + '\\n\\n';
        }
      }

      if (combinedText.length > 100) {
        return combinedText;
      }

      // Last resort: just grab everything from the body
      const bodyText = document.body.textContent.trim();
      return bodyText.substring(0, 5000); // Limit to first 5000 chars
    }

    return extractMainContent();
  `;

  const content = await runAppleScript(`
    tell application "Safari"
      set pageContent to do JavaScript "${jsScript.replace(/"/g, '\\"').replace(/\n/g, " ")}" in document 1
      return pageContent
    end tell
  `);

  // Clean up the content
  return cleanText(content);
}

/**
 * Cleans up text content
 */
function cleanText(text: string): string {
  if (!text) return "";

  return text
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, "\n\n") // Replace multiple newlines with double newline
    .substring(0, 2000) // Limit length for reasonable results
    .trim();
}

/**
 * Closes Safari
 */
async function closeSafari(): Promise<void> {
  try {
    await runAppleScript(`
      tell application "Safari"
        close document 1
      end tell
    `);
  } catch (error) {
    console.error("Error closing Safari tab:", error);
  }
}

export default { performSearch };
