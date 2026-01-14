
import asyncio
import websockets
import json
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_client")

async def test_client():
    uri = "ws://localhost:8765"
    async with websockets.connect(uri) as websocket:
        logger.info("Connected to WebSocket")
        
        # 1. Auth (if expected, but we disabled it)
        # await websocket.send(json.dumps({"type": "auth", "token": ""}))

        # 2. Status Request
        await websocket.send(json.dumps({"type": "status_request"}))
        logger.info("Sent status_request")
        
        response = await websocket.recv()
        logger.info(f"Received: {response}")

        # 3. Simulate Wake Word
        logger.info("Sending wake_detected...")
        await websocket.send(json.dumps({
            "type": "wake_detected",
            "wake_word": "alexa_v0.1"
        }))
        
        # 4. Simulate Audio Stream (Int16 PCM)
        logger.info("Sending audio stream...")
        # Send 1 second of silence (16000 samples * 2 bytes = 32000 bytes) in chunks
        chunk_size = 1024
        total_bytes = 32000
        sent_bytes = 0
        
        while sent_bytes < total_bytes:
            chunk = bytes(chunk_size) # Silence
            await websocket.send(chunk)
            sent_bytes += len(chunk)
            await asyncio.sleep(0.01) # Simulate real-time
            
        logger.info("Audio stream finished")
        
        # Keep alive for responses
        try:
            while True:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                logger.info(f"Received: {response}")
        except asyncio.TimeoutError:
            logger.info("Simulation complete (timeout)")

if __name__ == "__main__":
    asyncio.run(test_client())
