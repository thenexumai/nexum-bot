"""Browser automation capability for NEXUM PC Agent using Playwright."""

import base64
import asyncio
from typing import Optional


async def browser_navigate(url: str) -> dict:
    """Navigate to URL and return page title + content summary."""
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            title = await page.title()
            # Get text content
            content = await page.evaluate("() => document.body.innerText")
            await browser.close()
            return {
                "url": page.url,
                "title": title,
                "content_preview": content[:2000] if content else "",
            }
    except ImportError:
        raise RuntimeError("playwright not installed. Run: pip install playwright && playwright install chromium")


async def browser_screenshot(url: Optional[str] = None) -> str:
    """Take screenshot of current browser page or navigate to URL first."""
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            if url:
                await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            screenshot_bytes = await page.screenshot(full_page=False)
            await browser.close()
            return base64.b64encode(screenshot_bytes).decode()
    except ImportError:
        raise RuntimeError("playwright not installed")


async def browser_read_page(url: str) -> dict:
    """Read full page content for AI analysis."""
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=30000, wait_until="networkidle")
            title = await page.title()
            content = await page.evaluate("""() => {
                // Remove scripts, styles, nav elements
                const remove = document.querySelectorAll('script,style,nav,footer,aside');
                remove.forEach(el => el.remove());
                return document.body?.innerText ?? '';
            }""")
            links = await page.evaluate("""() =>
                Array.from(document.querySelectorAll('a[href]'))
                    .slice(0, 20)
                    .map(a => ({text: a.innerText.trim(), href: a.href}))
                    .filter(l => l.text && l.href)
            """)
            await browser.close()
            return {
                "url": page.url,
                "title": title,
                "content": content[:5000],
                "links": links,
            }
    except ImportError:
        raise RuntimeError("playwright not installed")
