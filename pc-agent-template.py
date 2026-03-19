#!/usr/bin/env python3
"""
NEXUM PC Agent - Self-contained executable
Generated on demand, embedded in Telegram bot
"""

import socket
import json
import time
import subprocess
import os
import sys
from datetime import datetime

class NEXUMAgent:
    def __init__(self, pairing_code: str, bot_url: str = "wss://nexum-bot.railway.app/ws"):
        self.pairing_code = pairing_code
        self.bot_url = bot_url
        self.device_id = self.get_device_id()
        self.connected = False
        
    def get_device_id(self) -> str:
        """Generate unique device ID"""
        hostname = socket.gethostname()
        mac = os.popen('getmac').read().strip()
        return f"{hostname}_{mac[:12]}"
    
    def connect(self) -> bool:
        """Connect to NEXUM bot"""
        try:
            import websocket
            
            self.ws = websocket.WebSocketApp(
                self.bot_url,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close,
                on_open=self.on_open
            )
            
            self.ws.run_forever()
            return True
        except ImportError:
            print("❌ websocket-client required: pip install websocket-client")
            return False
    
    def on_open(self, ws):
        """Connection opened - send pairing code"""
        msg = {
            "type": "pair",
            "code": self.pairing_code,
            "deviceId": self.device_id
        }
        ws.send(json.dumps(msg))
        print(f"✅ Pairing with code: {self.pairing_code}")
    
    def on_message(self, ws, message):
        """Handle incoming messages"""
        try:
            data = json.loads(message)
            
            if data.get("type") == "paired":
                if data.get("success"):
                    self.connected = True
                    print("✅ Successfully paired with NEXUM!")
                else:
                    print("❌ Pairing failed:", data.get("message"))
            
            elif data.get("type") == "command":
                self.execute_command(data.get("command"), data.get("params"))
            
            elif data.get("type") == "error":
                print("❌ Error:", data.get("message"))
        
        except json.JSONDecodeError:
            print("Invalid message format")
    
    def on_error(self, ws, error):
        print(f"❌ Connection error: {error}")
    
    def on_close(self, ws, close_status_code, close_msg):
        print("🔴 Connection closed")
        self.connected = False
    
    def execute_command(self, command: str, params: dict = None):
        """Execute system command"""
        try:
            if command == "screenshot":
                self.take_screenshot()
            elif command == "bash":
                self.run_bash(params.get("cmd"))
            elif command == "status":
                self.send_status()
            else:
                print(f"Unknown command: {command}")
        except Exception as e:
            self.send_error(str(e))
    
    def take_screenshot(self):
        """Take screenshot and send to bot"""
        try:
            from PIL import ImageGrab
            img = ImageGrab.grab()
            img.save("screenshot.png")
            print("📸 Screenshot taken")
        except ImportError:
            print("❌ Pillow required: pip install Pillow")
    
    def run_bash(self, cmd: str):
        """Run bash command"""
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            self.send_message({
                "type": "command_result",
                "result": result.stdout + result.stderr
            })
        except Exception as e:
            self.send_error(str(e))
    
    def send_status(self):
        """Send status to bot"""
        import psutil
        msg = {
            "type": "status",
            "status": "online",
            "deviceId": self.device_id,
            "cpu": psutil.cpu_percent(),
            "memory": psutil.virtual_memory().percent,
            "timestamp": datetime.now().isoformat()
        }
        self.ws.send(json.dumps(msg))
    
    def send_message(self, data: dict):
        """Send message to bot"""
        self.ws.send(json.dumps(data))
    
    def send_error(self, error: str):
        """Send error to bot"""
        self.send_message({
            "type": "error",
            "error": error
        })


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nexum_agent.py <pairing_code>")
        print("Example: python nexum_agent.py ABC123")
        sys.exit(1)
    
    pairing_code = sys.argv[1]
    agent = NEXUMAgent(pairing_code)
    
    print("🚀 NEXUM PC Agent starting...")
    print(f"Device: {agent.device_id}")
    
    if not agent.connect():
        sys.exit(1)
