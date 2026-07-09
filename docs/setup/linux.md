## Setup for Linux (Ubuntu/Debian)

1. Open your terminal and install Python, pip, virtual environment tools and Git:  
    ```sh
    sudo apt update
    sudo apt install python3 python3-pip python3-venv git
    ```

2. Navigate to the folder where you want the app installed and clone the repository:  
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    cd media-journal
    ```

3. Create and activate a Virtual Environment:
    ```sh
    python3 -m venv venv
    source venv/bin/activate
    ```

4. Install the dependencies:  
    ```sh
    pip install -r requirements.txt
    ```

5. Create the database:  
    ```sh
    python manage.py migrate
    ```

6. Generate static files (required after every update):  
    ```sh
    python manage.py collectstatic --noinput
    ```

7. Start the app:  
    ```sh
    TZ=Europe/London python manage.py runserver 0.0.0.0:8000 --noreload
    ```  
    Or use this command if you plan to run it on a machine 24/7:  
    ```sh
    TZ=Europe/London python -m waitress --listen=0.0.0.0:8000 --threads=8 media_journal.wsgi:application
    ```
    *(Replace `Europe/London` with your local timezone. You can find a clean list of supported timezones [here](https://www.php.net/manual/en/timezones.php)).*

8. Open the app in your browser at: [http://localhost:8000](http://localhost:8000)

9. Inside the app navigate to **Settings → API Keys**.
    You will need to add your own API keys. In that section there are instructions on how to obtain them.

---

### Access from Other Devices
To access the app from your phone, tablet or other devices on the same Wi-Fi network, use your computer's IP address instead of `localhost`. 

You can find your IP address by running this command in the terminal:
```sh
hostname -I
```
*(Example: Once you find it, you would type `http://192.168.1.15:8000` into your phone's browser).*

---

### Run Automatically on Boot
To make the app start automatically and silently in the background when your Linux machine boots up, you can use Linux's built-in service manager called `systemd`.

**1. Create the Service File:**  
Open your terminal and create a new service file using the `nano` text editor:
```sh
sudo nano /etc/systemd/system/mediajournal.service
```

**2. Add the Configuration:**  
Paste the following code into the terminal. **Make sure to replace** `/PATH/TO/YOUR/` with the actual path to your folder and change `YOUR_LINUX_USERNAME` to your actual username.
```ini
[Unit]
Description=Media Journal Waitress Server
After=network.target

[Service]
User=YOUR_LINUX_USERNAME
WorkingDirectory=/PATH/TO/YOUR/media-journal
# Replace Europe/London with your local timezone
Environment="TZ=Europe/London"
ExecStart=/PATH/TO/YOUR/media-journal/venv/bin/python -m waitress --listen=0.0.0.0:8000 --threads=8 media_journal.wsgi:application
Restart=always

[Install]
WantedBy=multi-user.target
```
*(To save and exit nano: Press `Ctrl+O`, `Enter`, then `Ctrl+X`).*
> For timezone you can find a clean list of supported timezones [here](https://www.php.net/manual/en/timezones.php).  

**3. Activate the Service:**  
Run these three commands to tell Linux to read your new file, start the app right now and enable it to start on every future boot:
```sh
sudo systemctl daemon-reload
sudo systemctl start mediajournal
sudo systemctl enable mediajournal
```

---

If you want to access the app from outside your local Wi-Fi network, check the following guides:

<div markdown="1" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">

[Read the Remote Access Guide](../configuration/remote-access.md){ .md-button }
[Read the Authentication Guide](../configuration/authentication.md){ .md-button }

</div>
