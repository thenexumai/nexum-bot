"""Advanced Comet-style Browser Engine for NEXUM Agent."""

import asyncio
import base64
import json
from playwright.async_api import async_playwright

class CometBrowser:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

    async def start(self, headless=True):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=headless)
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        )
        self.page = await self.context.new_page()

    async def navigate(self, url):
        await self.page.goto(url, wait_until="networkidle")
        return await self.get_state()

    async def get_state(self):
        # Маркировка элементов для AI
        await self.page.evaluate("""() => {
            const interactives = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
            interactives.forEach((el, i) => {
                el.setAttribute('data-nexum-id', i);
                el.style.border = '1px solid rgba(108,99,255,0.5)';
            });
        }""")
        
        screenshot = await self.page.screenshot(type='png')
        return {
            "url": self.page.url,
            "title": await self.page.title(),
            "screenshot": base64.b64encode(screenshot).decode('utf-8'),
            "page_content": await self.page.content()
        }

    async def click(self, nexum_id):
        await self.page.click(f'[data-nexum-id="{nexum_id}"]')
        await self.page.wait_for_load_state("networkidle")
        return await self.get_state()

    async def type(self, nexum_id, text):
        await self.page.fill(f'[data-nexum-id="{nexum_id}"]', text)
        return await self.get_state()

    async def stop(self):
        if self.browser: await self.browser.close()
        if self.playwright: await self.playwright.stop()

# Global instance for agent
browser_instance = CometBrowser()
