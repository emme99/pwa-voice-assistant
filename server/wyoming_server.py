"""
Wyoming Server for PWA Voice Assist.
Handles the connection to Home Assistant and bridges wake word events.
"""
import asyncio
import logging
from typing import Optional, Set
from wyoming.server import AsyncServer, AsyncEventHandler
from wyoming.event import Event
from wyoming.pipeline import RunPipeline, PipelineStage
from wyoming.info import Describe, Info, Satellite, Attribution
from wyoming.ping import Ping, Pong
from wyoming.audio import AudioChunk, AudioStart, AudioStop

logger = logging.getLogger(__name__)

class VoiceAssistEventHandler(AsyncEventHandler):
    """Event Handler for a single Wyoming client connection."""
    
    def __init__(self, wyoming_server, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        super().__init__(reader, writer)
        self.wyoming_server = wyoming_server
        self.wyoming_server.register_handler(self)

    async def handle_event(self, event: Event) -> bool:
        """Handle incoming events from Home Assistant."""
        if Describe.is_type(event.type):
            await self.send_info()
            return True
        
        if Ping.is_type(event.type):
            await self.write_event(Pong().event())
            return True
            
        # Bridge events to WebSocket clients
        if hasattr(self.wyoming_server, 'event_callback') and self.wyoming_server.event_callback:
            await self.wyoming_server.handle_external_event(event)

        # ACK AudioStop with Played to release HA Media Player state
        if AudioStop.is_type(event.type):
            logger.info("Received AudioStop from HA, sending 'played' event")
            await self.write_event(Event("played"))

        return True

    async def send_info(self):
        """Send Describe info to Home Assistant."""
        info = Info(
            satellite=Satellite(
                name="PWA Voice Assist",
                area="Browser",
                description="Browser-based Voice Satellite",
                attribution=Attribution(name="PWA Voice Assist", url="https://github.com/emme99/pwa-voice-assist"),
                installed=True,
                version="1.0.0"
            )
        )
        await self.write_event(info.event())
        logger.debug("Sent Describe Info")

    async def disconnect(self) -> None:
        """Called when client disconnects."""
        self.wyoming_server.unregister_handler(self)
        await super().disconnect()


class WyomingServer:
    """
    Wyoming protocol server.
    Advertises itself as a Satellite to Home Assistant.
    """
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.server: Optional[AsyncServer] = None
        self.handlers: Set[VoiceAssistEventHandler] = set()
        self.event_callback = None # Callback to send data to WebSocket clients
    
    def set_event_callback(self, callback):
        self.event_callback = callback

    async def handle_external_event(self, event: Event):
        """Translate Wyoming events to PWA JSON events."""
        if not self.event_callback:
            return

        try:
            # 1. Transcript (STT Text)
            if event.type == "transcript":
                text = event.data.get("text", "")
                logger.info(f"Received Transcript: {text}")
                await self.event_callback({
                    "type": "voice_event",
                    "event_type": 4, # STT_END
                    "data": {"text": text}
                })

            # 2. Synthesize (TTS Text)
            elif event.type == "synthesize":
                text = event.data.get("text", "")
                logger.info(f"Received Synthesize: {text}")
                await self.event_callback({
                    "type": "voice_event",
                    "event_type": 7, # TTS_START
                    "data": {"text": text}
                })
            
            # 3. Audio Start (TTS Config)
            elif event.type == "audio-start":
                data = event.data
                rate = data.get("rate", 22050)
                logger.info(f"Received AudioStart: {rate}Hz")
                await self.event_callback({
                    "type": "config_audio",
                    "rate": rate
                })

            # 4. Audio Chunk (TTS Audio)
            elif event.type == "audio-chunk":
                # Extract raw audio
                payload = event.payload
                await self.event_callback(payload, is_binary=True)
                
            # 4. Audio Stop (TTS Finished)
            elif event.type == "audio-stop":
                await self.event_callback({
                    "type": "voice_event",
                    "event_type": 2, # RUN_END
                    "data": {}
                })
                
        except Exception as e:
            logger.error(f"Error handling external event: {e}")
    
    async def start(self):
        """Start the Wyoming server."""
        self.server = AsyncServer.from_uri(f"tcp://{self.host}:{self.port}")
        logger.info(f"Wyoming server running on tcp://{self.host}:{self.port}")
        # Run blocks, so this needs to be awaited in a task (which it is in main.py)
        await self.server.run(self._make_handler)

    def _make_handler(self, reader, writer):
        """Factory for event handlers."""
        return VoiceAssistEventHandler(self, reader, writer)

    def register_handler(self, handler: VoiceAssistEventHandler):
        self.handlers.add(handler)
        logger.info(f"Wyoming client connected. Total: {len(self.handlers)}")
        if self.event_callback:
            asyncio.create_task(self.event_callback({
                'type': 'ha_status',
                'connected': True
            }))

    def unregister_handler(self, handler: VoiceAssistEventHandler):
        self.handlers.discard(handler)
        logger.info(f"Wyoming client disconnected. Total: {len(self.handlers)}")
        if self.event_callback:
            asyncio.create_task(self.event_callback({
                'type': 'ha_status',
                'connected': len(self.handlers) > 0
            }))

    async def trigger_wake_word(self, wake_word_id: str = "default"):
        """
        Trigger a wake word detection event.
        This tells HA to start the pipeline at the STT stage.
        """
        if not self.handlers:
            logger.warning("No Wyoming clients connected. cannot trigger wake word.")
            return

        logger.info(f"Triggering Wake Word: {wake_word_id} -> RunPipeline(start_stage=STT)")
        
        # Create RunPipeline event
        pipeline_event = RunPipeline(
            start_stage=PipelineStage.ASR,
            end_stage=PipelineStage.TTS, 
            restart_on_end=False
        ).event()
        
        # Create AudioStart event
        audio_start_event = AudioStart(
            rate=16000,
            width=2,
            channels=1
        ).event()

        # Broadcast to all connected HA instances
        # We need to copy the set to avoid modification during iteration if something disconnects rapidly
        for handler in list(self.handlers):
            try:
                await handler.write_event(pipeline_event)
                await handler.write_event(audio_start_event)
            except Exception as e:
                logger.error(f"Failed to send event to client: {e}")

    async def send_audio(self, audio_data: bytes):
        """
        Send audio chunk to Home Assistant.
        """
        if not self.handlers:
            return
        
        # DEBUG: Log occasionally
        if not hasattr(self, '_audio_log_counter'):
            self._audio_log_counter = 0
        self._audio_log_counter += 1
        if self._audio_log_counter % 50 == 0:
            logger.info(f"Sending audio chunk to HA ({len(audio_data)} bytes)")

        # Create AudioChunk event (16kHz, 16-bit mono)
        chunk = AudioChunk(
            rate=16000,
            width=2,
            channels=1,
            audio=audio_data
        ).event()
        
        # Broadcast to all connected HA instances
        for handler in list(self.handlers):
            try:
                await handler.write_event(chunk)
            except Exception as e:
                logger.error(f"Failed to send audio chunk: {e}")

    async def stop(self):
        """Stop the server."""
        if self.server:
            # Note: AsyncServer doesn't expose a clean external stop() method easily when running via .run() 
            # as it blocks. But since we run it in a Task in main.py, cancelling that task 
            # stops the run loop. We should just ensure handlers are closed.
            pass
