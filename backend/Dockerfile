FROM python:3.11-slim

WORKDIR /app

# Install git (needed by gitpython)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy .env.example as default .env (real values override via docker-compose env:)
RUN cp -n .env.example .env || true

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
