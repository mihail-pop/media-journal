# Use an official Python base image
FROM python:3.13-slim

# Link the image to the GitHub repo
LABEL org.opencontainers.image.source="https://github.com/mihail-pop/media-journal"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Copy project files
COPY . /app/

# Install dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Expose the port Django runs on
EXPOSE 8000

# Run Django server directly
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
