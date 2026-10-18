FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
COPY service ./service
COPY artifacts ./artifacts
# Serving needs the price history: mount it, or point MGO_DATA_DIR at a copy (Supabase loader is a TODO).
ENV MGO_DATA_DIR=/data
EXPOSE 8000
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000"]
