## Setup for Mac

1. Download [Python 3.13.0](https://www.python.org/downloads/release/python-3130/).  
    Run the installer. *(Note: After installation finishes, open your **Applications** folder, open the **Python 3.13** folder and double-click `Install Certificates.command`. This ensures the app can safely connect to APIs).*

2. Open a terminal inside the folder where you want the app installed:  
    Press `Cmd + Space`, type **Terminal** and press Enter. 
    Type `cd ` *(with a space after it)*, drag the folder you want to use from Finder directly into the terminal window and press **Enter**.

3. Clone the repository:  
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```  
    *(Note: If you don't have Git installed, your Mac will automatically pop up a window asking to install "Command Line Developer Tools". Click Install, wait for it to finish and run the command again).*

    Then navigate into the newly created folder:
    ```sh
    cd media-journal
    ```

4. Create and activate a Virtual Environment:
    *(macOS requires apps to use their own isolated Python environments).*
    ```sh
    python3 -m venv venv
    source venv/bin/activate
    ```

5. Install the dependencies:  
    ```sh
    pip3 install -r requirements.txt
    ```

6. Create the database:  
    ```sh
    python3 manage.py migrate
    ```

7. Generate static files (required after every update):  
    ```sh
    python3 manage.py collectstatic --noinput
    ```

8. Start the app:  
    ```sh
    TZ=Europe/London python3 manage.py runserver 0.0.0.0:8000 --noreload
    ```  
    Or use this command if you plan to run it on a machine 24/7:  
    ```sh
    TZ=Europe/London python3 -m waitress --listen=0.0.0.0:8000 --threads=8 media_journal.wsgi:application
    ```
    *(Replace `Europe/London` with your local timezone. You can find a clean list of supported timezones [here](https://www.php.net/manual/en/timezones.php)).*

9. Open the app in your browser at: [http://localhost:8000](http://localhost:8000)

10. Inside the app navigate to **Settings → API Keys**.
    You will need to add your own API keys. In that section there are instructions on how to obtain them.

---

### Access from Other Devices
To access the app from your phone, tablet or other devices on the same Wi-Fi network, use your Mac's IP address instead of `localhost`. 

You can easily find your IP Address by holding down the **Option (⌥)** key and clicking the **Wi-Fi icon** in your top menu bar. Look for `IP Address`.  
*(Example: Once you find it, you would type `http://192.168.1.15:8000` into your phone's browser).*

---

### Run Automatically on Startup
To make the app start automatically and silently in the background when you log into your Mac, you can use the built-in macOS service manager (`launchd`). No third-party apps are needed.

**1. Create the Service File:**  
Open a plain text editor (like TextEdit) and create a file called `com.mediajournal.plist`. Paste the following code into it, replacing `/PATH/TO/YOUR/` with the actual path to your `media-journal` folder.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mediajournal</string>
    <key>WorkingDirectory</key>
    <string>/PATH/TO/YOUR/media-journal</string>
    <key>EnvironmentVariables</key>
    <dict>
        <!-- Replace Europe/London with your local timezone -->
        <key>TZ</key>
        <string>Europe/London</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
        <string>/PATH/TO/YOUR/media-journal/venv/bin/python3</string>
        <string>-m</string>
        <string>waitress</string>
        <string>--listen=0.0.0.0:8000</string>
        <string>--threads=8</string>
        <string>media_journal.wsgi:application</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```
> For timezone you can find a clean list of supported timezones [here](https://www.php.net/manual/en/timezones.php).  

**2. Move the file to your hidden LaunchAgents folder:**  
In Finder, press `Cmd + Shift + G`, type `~/Library/LaunchAgents/` and press Enter. Drag your `com.mediajournal.plist` file into this folder.

**3. Activate the Service:**  
Open Terminal and run this command:
```sh
launchctl load ~/Library/LaunchAgents/com.mediajournal.plist
```
The app will now run silently in the background every time you log in! *(To stop it manually, run the same command but replace `load` with `unload`)*.

---

### Run Automatically on Boot
If you want the app to start before you log into your Mac, you can start it as a system service. You can do this by using the exact same `.plist` file from the previous step, but placing it in the System Daemon folder instead.

1. Follow **Step 1** above to create the `.plist` file.
2. In Finder, press `Cmd + Shift + G` and go to `/Library/LaunchDaemons/` *(Notice there is no `~` at the start of this path!)*.
3. Drag the `.plist` file into this folder. It will ask for your Mac admin password to confirm.
4. Activate the background boot service by running this command in Terminal:
    ```sh
    sudo launchctl load /Library/LaunchDaemons/com.mediajournal.plist
    ```

---

If you want to access the app from outside your local Wi-Fi network, check the following guides:

<div markdown="1" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">

[Read the Remote Access Guide](../configuration/remote-access.md){ .md-button }
[Read the Authentication Guide](../configuration/authentication.md){ .md-button }

</div>
