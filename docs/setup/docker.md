## Setup for Docker

> **New to Docker?** If you haven't used Docker before and plan to run the app on your personal PC or laptop, check the other guides to set up the app natively without Docker.

1. Clone the repository:
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```

2. Open the `docker-compose.yml` file in a text editor, uncomment and update the `TZ` variable to your timezone.  
    *(Format is usually `Continent/City` like `Europe/London` or `America/New_York`. You can find a clean list of supported timezones [here](https://www.php.net/manual/en/timezones.php)).* Otherwise, it will default to UTC.

3. Open a terminal in the project folder and start the app with:  
    ```sh
    docker-compose up -d
    ```  
    The application will be available at [http://localhost:8090](http://localhost:8090).
  
4. Inside the app, navigate to **Settings → API Keys**.  
    You will need to add your own API keys. In that section there are instructions on how to obtain them.

---

### Remote Access

If you plan to use a tool like Cloudflare Tunnels to access the app remotely, you need to whitelist your domain name. 

Open your `docker-compose.yml` file and uncomment the `CSRF_TRUSTED_ORIGINS` line. Add your remote URL there:
```yaml
environment:  
  - CSRF_TRUSTED_ORIGINS=https://your-domain.com
```
*(Note: If you have multiple domains, you can separate them with a comma).*
---

### Authentication

If you expose the app to the internet it is highly recommended to turn on authentication. You can enable this by uncommenting `REQUIRE_LOGIN=True` in your `docker-compose.yml` file.

To log in you will also need to create an administrator account (superuser).

[Read the Authentication Guide](../configuration/authentication.md#step-1-create-an-account){ .md-button style="margin: 0 auto; display: block; width: fit-content;" }