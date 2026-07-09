## Remote Access

To access Media Journal when away from home (for example, from a phone on cellular data) you have two main options.

---

### Option 1: The Private Way (Tailscale)
If you only need access for yourself this is the easiest and safest method. 

You can use **[Tailscale](https://tailscale.com/)**, which is free for personal use. You install it on the machine running Media Journal and on your remote devices. It creates a direct, peer-to-peer encrypted tunnel between them. 

* **Pros:** Free, extremely secure, requires no domain configuration and the app does not need to be exposed to the public internet.  
* **Cons:** Anyone attempting to access the app must have the Tailscale app installed and be authenticated on your Tailscale network.

---

### Option 2: The Public Way (Cloudflare Tunnels)
To access the app from any web browser without installing a VPN app you must expose it to the internet. The modern standard for this is **Cloudflare Tunnels** using their **[Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/)** application. 

This requires a domain name. You can buy cheap promotional domains for $1–$2 for the first year from registrars such as [Porkbun](https://porkbun.com/) or you can find platforms that give free subdomains. However, free subdomains usually take a long time to register, don't work well with Cloudflare or are extremely slow.

* **Pros:** The app is accessible instantly from any browser in the world via your custom URL.
* **Cons:** Requires technical setup. **You must also enable [Authentication](authentication.md) to prevent strangers from modifying your lists and accessing your data.**

---

### Configuring the App for a Domain
If you choose **Option 2** your app's built-in security will block login attempts. It detects the traffic originating from `https://your-domain.com` instead of `localhost` and blocks it as a security measure. 

To resolve this you must whitelist your domain name by setting the `CSRF_TRUSTED_ORIGINS` environment variable.

=== "Docker"

    Open your `docker-compose.yml` file and uncomment the `CSRF_TRUSTED_ORIGINS` line under the environment section. Ensure you include the `https://` prefix.
    ```yaml
    environment:
      - CSRF_TRUSTED_ORIGINS=https://your-domain.com
    ```
    *(For multiple domains separate them with a comma).*

    Restart your container to apply the changes:
    ```sh
    docker-compose down
    docker-compose up -d
    ```

=== "Windows"

    **If using the `.bat` file (Recommended):**  
    Open your `run_journal.bat` file in a text editor and add the variable right before the runserver command:
    ```bat
    set CSRF_TRUSTED_ORIGINS=https://your-domain.com
    %PY% manage.py runserver 0.0.0.0:8000 --noreload
    ```

    **If running manually in PowerShell:**
    ```powershell
    $env:CSRF_TRUSTED_ORIGINS="https://your-domain.com"
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```

    **If running manually in CMD:**
    ```cmd
    set CSRF_TRUSTED_ORIGINS=https://your-domain.com
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```

=== "Mac"

    **If using the Launchd Background Service (Recommended):**  
    Open your `com.mediajournal.plist` file in a text editor and add it to your `EnvironmentVariables` dictionary:
    ```xml
    <key>EnvironmentVariables</key>
    <dict>
        <key>CSRF_TRUSTED_ORIGINS</key>
        <string>https://your-domain.com</string>
    </dict>
    ```
    Restart the service in the terminal:
    ```sh
    launchctl unload ~/Library/LaunchAgents/com.mediajournal.plist
    launchctl load ~/Library/LaunchAgents/com.mediajournal.plist
    ```

    **If running manually in the terminal:**
    ```sh
    export CSRF_TRUSTED_ORIGINS=https://your-domain.com
    python3 manage.py runserver 0.0.0.0:8000 --noreload
    ```

=== "Linux"

    **If using the Systemd Background Service (Recommended):**  
    Edit your service file (`sudo nano /etc/systemd/system/mediajournal.service`) and add it under the `[Service]` section:
    ```ini
    [Service]
    Environment="CSRF_TRUSTED_ORIGINS=https://your-domain.com"
    ```
    *(If you already have `REQUIRE_LOGIN=True` configured you can separate them with a space: `Environment="REQUIRE_LOGIN=True" "CSRF_TRUSTED_ORIGINS=https://your-domain.com"`).*

    Restart the service:
    ```sh
    sudo systemctl daemon-reload
    sudo systemctl restart mediajournal
    ```

    **If running manually in the terminal:**
    ```sh
    export CSRF_TRUSTED_ORIGINS=https://your-domain.com
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```