## Authentication

By default Media Journal does not require a login to access. If you are hosting the app on a local network for personal use this is usually fine. 

However, if you plan to expose the app to the internet (using a reverse proxy or Cloudflare Tunnels) it is highly recommended to enable authentication. This will lock down the entire app including your uploaded images and screenshots so only you can access them.

Setting up authentication is a two-step process: you must create an administrator account and then tell the app to require a login.

---

### Step 1: Create an Account
Before you lock the app you need to create a "Superuser" account so you can actually log in.

=== "Docker"

    Open a terminal on the machine running your Docker container and run:
    ```sh
    docker exec -it media-journal python manage.py createsuperuser
    ```
    *It will prompt you to create a username, email (optional) and password. Note that as you type your password nothing will show on the screen for security reasons.*

=== "Windows"

    Open a terminal inside your `media-journal` folder and run:
    ```sh
    python manage.py createsuperuser
    ```
    *It will prompt you to create a username, email (optional) and password. Note that as you type your password nothing will show on the screen for security reasons.*

=== "Mac"

    Open your terminal, navigate to your `media-journal` folder, activate your virtual environment and run the command:
    ```sh
    source venv/bin/activate
    python3 manage.py createsuperuser
    ```
    *It will prompt you to create a username, email (optional) and password. Note that as you type your password nothing will show on the screen for security reasons.*

=== "Linux"

    Open your terminal, navigate to your `media-journal` folder, activate your virtual environment and run the command:
    ```sh
    source venv/bin/activate
    python manage.py createsuperuser
    ```
    *It will prompt you to create a username, email (optional) and password. Note that as you type your password nothing will show on the screen for security reasons.*

---

### Step 2: Enable the Login Screen
Now that you have an account you need to start the app with the `REQUIRE_LOGIN=True` environment variable.

=== "Docker"

    Open your `docker-compose.yml` file and uncomment the `REQUIRE_LOGIN` line under the environment section:
    ```yaml
    environment:
      - REQUIRE_LOGIN=True
    ```
    Then restart your container to apply the changes:
    ```sh
    docker-compose down
    docker-compose up -d
    ```

=== "Windows"

    **If using the `.bat` file (Recommended):**  
    Open your `run_journal.bat` file in a text editor and add `set REQUIRE_LOGIN=True` right before the runserver command:
    ```bat
    set REQUIRE_LOGIN=True
    %PY% manage.py runserver 0.0.0.0:8000 --noreload
    ```

    **If running manually in PowerShell:**
    ```powershell
    $env:REQUIRE_LOGIN="True"
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```

    **If running manually in CMD:**
    ```cmd
    set REQUIRE_LOGIN=True
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```

=== "Mac"

    **If using the Launchd Background Service (Recommended):**  
    Open your `com.mediajournal.plist` file in a text editor and add the `EnvironmentVariables` dictionary right above your `ProgramArguments`:
    ```xml
    <key>EnvironmentVariables</key>
    <dict>
        <key>REQUIRE_LOGIN</key>
        <string>True</string>
    </dict>
    ```
    Then restart the service in the terminal:
    ```sh
    launchctl unload ~/Library/LaunchAgents/com.mediajournal.plist
    launchctl load ~/Library/LaunchAgents/com.mediajournal.plist
    ```

    **If running manually in the terminal:**
    ```sh
    export REQUIRE_LOGIN=True
    python3 manage.py runserver 0.0.0.0:8000 --noreload
    ```

=== "Linux"

    **If using the Systemd Background Service (Recommended):**  
    Edit your service file (`sudo nano /etc/systemd/system/mediajournal.service`) and add `Environment="REQUIRE_LOGIN=True"` under the `[Service]` section:
    ```ini
    [Service]
    Environment="REQUIRE_LOGIN=True"
    User=YOUR_LINUX_USERNAME
    ```
    Then restart the service:
    ```sh
    sudo systemctl daemon-reload
    sudo systemctl restart mediajournal
    ```

    **If running manually in the terminal:**
    ```sh
    export REQUIRE_LOGIN=True
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```