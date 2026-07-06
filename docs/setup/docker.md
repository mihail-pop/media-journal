## Setup for Docker
1. Clone the repository:
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```

2. Open the `docker-compose.yml` file in a text editor, uncomment and update the `TZ` variable to your timezone (e.g., `TZ=Europe/London`). Otherwise, it will default to UTC.

3. Open a terminal in the project folder and start the app with:  
    ```sh
    docker-compose up -d
    ```  
    The application will be available at [http://localhost:8090](http://localhost:8090).
  
4. Inside the app, navigate to **Settings → API Keys**.  
   You will need to add your own API keys. In that section there are instructions on how to obtain them.

### Configuration

The application can be configured using environment variables.

- `CSRF_TRUSTED_ORIGINS`: A comma-separated list of trusted origins for POST requests. This is necessary if you are accessing the application from a different domain.

    For example, in `docker-compose.yml`:  
    ```yaml
    environment:  
    - CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://another-domain.com
    ```