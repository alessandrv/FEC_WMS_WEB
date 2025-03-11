# WMS Backend

This is the Flask backend for the Warehouse Management System (WMS).

## Environment Configuration

The application now uses environment variables for configuration. To set up:

1. Copy the example environment file:
   ```
   cp .env.example .env
   ```

2. Edit the `.env` file to match your environment:
   ```
   # Database configuration
   DB_DSN=fec
   DB_USER=informix
   DB_PASSWORD=informix

   # Flask application configuration
   FLASK_HOST=0.0.0.0  # Use 127.0.0.1 for local-only access
   FLASK_PORT=5000
   FLASK_DEBUG=True
   ```

## Installation

Install the required dependencies:

```
pip install -r requirements.txt
```

## Running the Application

Run the Flask application:

```
python backend.py
```

Alternatively, use the `start.bat` script from the root directory to launch both the frontend and backend. 