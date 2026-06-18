FROM python:3.11-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy English model
RUN python -m spacy download en_core_web_sm

#IMPORTANT: ensure path exists
RUN mkdir -p /ms-playwright

RUN python -m playwright install-deps
RUN python -m playwright install chromium

COPY . .

CMD ["uvicorn", "api.backend:app", "--host", "0.0.0.0", "--port", "8080"]