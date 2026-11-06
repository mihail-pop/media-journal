## Remote Access

To access Media Journal when away from home (for example, from a phone on cellular data) you have two main options.

---

### Option 1: The Private Way (Tailscale)
If you only need access for yourself this is the easiest and safest method. 

You can use **[Tailscale](https://tailscale.com/)**, which is free for personal use. You install it on the machine running Media Journal and on your remote devices. It creates a direct, peer-to-peer encrypted tunnel between them. 

* **Pros:** Free, extremely secure, requires no domain configuration and the app does not need to be exposed to the public internet.  
* **Cons:** You must install Tailscale on every device you want to connect from. Also, if you use Private DNS on your Android phone (like AdGuard DNS), you may need to turn it off for the Tailscale address to work.

#### HTTPS with Tailscale Serve

A plain `http://` Tailscale address works for browsing, but home screen installation generally needs HTTPS. You can get a private HTTPS address without buying a domain by using [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

1. Start Media Journal normally, then open a terminal on the machine running both Media Journal and Tailscale.
2. Run:
    ```sh
    tailscale serve --bg http://127.0.0.1:8000
    ```
    For the default Docker setup, use `http://127.0.0.1:8090` instead, since that is the port exposed on the host. If Tailscale asks you to enable HTTPS, follow the link it provides.
3. Copy the HTTPS address shown by the command. It will look like `https://your-device.your-tailnet.ts.net/`. Add that origin to `CSRF_TRUSTED_ORIGINS` using the instructions below, then restart Media Journal.
4. Open that HTTPS address on your phone while connected to Tailscale. You can then [add Media Journal to your home screen](../app-guide/how-to-use.md#28-add-to-your-home-screen).

The `--bg` option keeps Serve configured across reboots. Media Journal and Tailscale still need to be running, and access remains private to your tailnet. To stop serving the HTTPS address, run:

```sh
tailscale serve --https=443 off
```

---

### Option 2: The Public Way (Cloudflare Tunnels)
To access the app from any web browser without installing a VPN app you must expose it to the internet. The modern standard for this is **Cloudflare Tunnels** using their **[Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/)** application. 

This requires a domain name. You can buy cheap promotional domains for around $1–$2 for the first year from registrars such as [Porkbun](https://porkbun.com/), or look for platforms that give free subdomains. Some free subdomain services can take a long time to register or have limitations with Cloudflare.

Your domain needs to be configured with Cloudflare. Follow their [Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) to connect your public hostname to the local Media Journal server.

* **Pros:** The app is accessible instantly from any browser in the world via your custom URL.
* **Cons:** Requires technical setup. **You must also enable [Authentication](authentication.md) to prevent strangers from modifying your lists and accessing your data.**

---

### Configuring the App for a Domain
When accessing the app through an HTTPS proxy, pages may load while login attempts or actions that save changes fail with a CSRF error. This can happen because Django receives HTTP traffic from the proxy while your browser uses an HTTPS address.

Set the `CSRF_TRUSTED_ORIGINS` environment variable to your external origin, such as `https://your-domain.com` or your Tailscale HTTPS origin. Include the scheme and any non-default port, but leave out the trailing slash and page path. For multiple origins, separate them with commas.

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
    Open your `com.mediajournal.plist` file in a text editor and add it to your existing `EnvironmentVariables` dictionary. Keep any keys already there, such as `TZ` or `REQUIRE_LOGIN`, rather than adding a second dictionary:
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
