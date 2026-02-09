# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (simple_api.py + api/)
COPY simple_api.py .
COPY api/ ./api/

# Copy public directory with frontend
COPY public/ ./public/

# Expose port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV GCP_PROJECT=operaciones-br
ENV GEMINI_API_KEY=AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4

# Run the application
CMD ["uvicorn", "simple_api:app", "--host", "0.0.0.0", "--port", "8080"]
