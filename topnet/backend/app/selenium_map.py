from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.remote.remote_connection import RemoteConnection
import logging
import time
import base64
from pathlib import Path

logger = logging.getLogger(__name__)

class SeleniumMapGenerator:
    def __init__(self, selenium_host="selenium", selenium_port=4444):
        self.selenium_url = f"http://{selenium_host}:{selenium_port}/wd/hub"
        self.driver = None
        logger.info(f"Selenium map generator initialized with URL: {self.selenium_url}")
    
    def _init_driver(self):
        """Initialize remote Chrome driver"""
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--window-size=1920,1080")
            
            self.driver = webdriver.Remote(
                command_executor=self.selenium_url,
                options=chrome_options
            )
            logger.info("✅ Selenium driver initialized successfully")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize Selenium driver: {e}")
            return False
    
    def take_map_screenshot(self, address: str, output_path: Path) -> bool:
        """Take a screenshot of the address on OpenStreetMap"""
        try:
            if not self.driver and not self._init_driver():
                return False
            
            # Clean the address for URL
            search_query = address.replace(' ', '+')
            
            # Use OpenStreetMap (no API key needed)
            map_url = f"https://www.openstreetmap.org/search?query={search_query}"
            logger.info(f"🌍 Navigating to: {map_url}")
            
            self.driver.get(map_url)
            
            # Wait for map to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "leaflet-container"))
            )
            
            # Give it a moment to render
            time.sleep(2)
            
            # Take screenshot
            screenshot = self.driver.get_screenshot_as_png()
            with open(output_path, 'wb') as f:
                f.write(screenshot)
            
            logger.info(f"✅ Map screenshot saved to {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Selenium map generation failed: {e}")
            return False
    
    def get_map_as_html(self, address: str) -> str:
        """Generate HTML with embedded map image"""
        try:
            import tempfile
            temp_file = Path(tempfile.gettempdir()) / f"map_{int(time.time())}.png"
            
            if self.take_map_screenshot(address, temp_file):
                with open(temp_file, 'rb') as f:
                    img_data = base64.b64encode(f.read()).decode('utf-8')
                
                # Clean up temp file
                temp_file.unlink()
                
                # Return HTML with embedded image
                return f'''
                <div style="width: 100%; height: 100%; display: flex; flex-direction: column;">
                    <img src="data:image/png;base64,{img_data}" 
                         style="width: 100%; height: calc(100% - 30px); object-fit: cover; border-radius: 8px;">
                    <p style="margin-top: 10px; font-size: 14px; color: #666; text-align: center;">
                        📍 {address}
                    </p>
                </div>
                '''
            return '<div class="map-error">Could not generate map</div>'
        except Exception as e:
            logger.error(f"Error creating map HTML: {e}")
            return f'<div class="map-error">Error: {str(e)}</div>'
    
    def close(self):
        """Close the driver"""
        if self.driver:
            self.driver.quit()
            self.driver = None
            logger.info("Selenium driver closed")