"""
Hybrid Voice Satellite Server
Main entry point for the Python server component (ESPHome Protocol).
"""
import asyncio
import logging
import yaml
import signal
import sys
from pathlib import Path

# Import WebSocket and Wyoming modules
from websocket_server import WebSocketServer
from wyoming_server import WyomingServer


def load_config(config_path: str = "config.yaml") -> dict:
    base_dir = Path(__file__).parent.resolve()
    config_file = base_dir / config_path
    
    if not config_file.exists():
        example_config = base_dir / "config.example.yaml"
        if example_config.exists():
            print(f"Config file not found at {config_file}, using {example_config}")
            config_file = example_config
        else:
            print(f"No configuration file found at {config_file} or {example_config}!")
            sys.exit(1)
    
    with open(config_file, 'r') as f:
        return yaml.safe_load(f)


def setup_logging(config: dict):
    log_level = config.get('logging', {}).get('level', 'INFO')
    log_file = config.get('logging', {}).get('file')
    
    if log_file:
        log_path = Path(log_file)
        if not log_path.is_absolute():
            base_dir = Path(__file__).parent.resolve()
            log_path = base_dir / log_path
        
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = str(log_path) # Convert back to string for logging config

    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file) if log_file else logging.NullHandler()
        ]
    )


async def main():
    """Main application entry point."""
    config = load_config()
    setup_logging(config)
    
    logger = logging.getLogger(__name__)
    logger.info("Starting PWA Voice Assist Server")
    
    server_config = config.get('server', {})
    
    # Initialize Wyoming Server (Talks to HA)
    wyoming_port = 10400 # Default Wyoming Port
    wyoming_server = WyomingServer(
        host=server_config.get('host', '0.0.0.0'),
        port=wyoming_port
    )
    
    # Initialize WebSocket server (Listens for Browsers)
    # Check for SSL certificates in client directory
    ssl_context = None
    curr_dir = Path(__file__).parent.resolve()
    client_dir = curr_dir.parent / "client"
    cert_file = client_dir / "cert.pem"
    key_file = client_dir / "key.pem"
    
    ssl_enabled = server_config.get('ssl', False)
    
    if ssl_enabled and cert_file.exists() and key_file.exists():
        import ssl
        logger.info(f"Loading SSL certificates from {cert_file}")
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cert_file, key_file)
    
    ws_server = WebSocketServer(
        host=server_config.get('host', '0.0.0.0'),
        port=server_config.get('port', 8765),
        auth_token=server_config.get('auth_token'),
        ssl_context=ssl_context,
        client_config=config.get('client', {})
    )
    
    # Link Wyoming Server to WebSocket Server for events
    ws_server.wyoming_ref = wyoming_server
    
    # Callback to bridge events from Wyoming -> WebSocket Clients
    async def bridge_callback(message, is_binary=False):
        if is_binary:
            await ws_server.broadcast(message) # Send bytes directly
        else:
            await ws_server.broadcast_json(message)

    wyoming_server.set_event_callback(bridge_callback)
    
    # Start Services
    # Wyoming runs in a background task because its run() is blocking
    wyoming_task = asyncio.create_task(wyoming_server.start())
    
    # Shutdown handler
    shutdown_event = asyncio.Event()
    
    def signal_handler(sig, frame):
        logger.info("Received shutdown signal")
        if shutdown_event.is_set():
            logger.warning("Forced shutdown...")
            sys.exit(1)
        shutdown_event.set()
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Start WS Server
        await ws_server.start()
        
        # Keep running
        logger.info("Services started. Press Ctrl+C to stop.")
        while not shutdown_event.is_set():
             await asyncio.sleep(0.1)
        
    except asyncio.CancelledError:
        logger.info("Main task cancelled")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        logger.info("Shutting down...")
        try:
            wyoming_task.cancel()
            await ws_server.stop()
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")
        logger.info("Shutdown complete")


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Unexpected error: {e}")
