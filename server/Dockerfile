FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY server ./server
COPY client ./client

# Set working directory to server
WORKDIR /app/server

# Expose WebSocket (8765) and Wyoming (10400)
EXPOSE 8765
EXPOSE 10400

# Run the application
CMD ["python", "main.py"]
