FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Change "main:app" to match your app's module:variable
CMD ["uvicorn", "api.backend:app", "--host", "0.0.0.0", "--port", "8080"]