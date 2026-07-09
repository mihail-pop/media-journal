## Setup for Windows

> [**Youtube Tutorial**](https://youtu.be/Kopjki76ZxM?si=iQCA4Pbh_YYu9Q7y)

1. Download [Python 3.13.0](https://www.python.org/downloads/release/python-3130/).  
    During installation check the option:
    *“Add Python to PATH”*.

2. Open a terminal inside the folder where you want the app installed:  
    Right-click inside your folder → Select **Open in Terminal**.

3. Clone the repository ([download GIT](https://git-scm.com/install/windows)):  
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```  
    Then open a terminal in the newly created folder.

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
    python manage.py runserver 0.0.0.0:8000 --noreload
    ```  
    Or use this command if you plan to run it on a machine 24/7.  
    ```sh
    python -m waitress --listen=0.0.0.0:8000 --threads=8 media_journal.wsgi:application
    ```

8. Open the app in your browser at: http://localhost:8000

9. Inside the app navigate to **Settings → API Keys**.
    You will need to add your own API keys. In that section there are instructions on how to obtain them.

---

### Access from Other Devices
To access the app from your phone, tablet or other devices on the same Wi-Fi network, use your computer's IPv4 address instead of `localhost`. 

You can find your IPv4 address by opening a terminal and running `ipconfig`.  
*(Example: Once you find it, you would type `http://192.168.1.15:8000` into your phone's browser).*

---

### Run Automatically on Startup
To make the app start automatically in the background when you log into Windows, you can use a combination of a `.bat` file (to run the app) and a `.vbs` file (to hide the terminal window so it isn't in your way).

**1. Create a `.bat` file (e.g., `run_journal.bat`) inside your project folder:**  
```bat
@echo off  
cd /d "C:\***path to your folder***\media-journal"  
set PY="C:\***path to your python***\Python\Python313\python.exe"  
%PY% manage.py migrate  
%PY% manage.py collectstatic --noinput  
%PY% manage.py runserver 0.0.0.0:8000 --noreload
```

**2. Create a `.vbs` file in your Windows Startup folder:**  
*(Press `Win + R`, type `shell:startup` and press Enter to open the folder).*
```vbs
Set WshShell = CreateObject("WScript.Shell")  
WshShell.Run """C:\***path to your bat file***\run_journal.bat""", 0  
Set WshShell = Nothing
```

---

### Run Automatically on Boot
If you want the app to start before you log into Windows, you can start it as a service. You can do this by turning the `.bat` file from the previous step into a Windows service using **NSSM**. (The `.vbs` file won't be needed anymore).

1. Open a terminal as Administrator and install NSSM:
    ```sh
    winget install nssm
    ```

2. Once installed, open a fresh Administrator terminal and run:
    ```sh
    nssm install MediaJournal
    ```

3. A graphical window will appear. In the **Application** tab, under **Path**, select the `.bat` file you created earlier.

4. Go to the **Log on** tab, select **This account** and type in your Windows username and password.

5. Click **Install service**. 

6. To start it immediately without restarting your PC, run:
    ```sh
    nssm start MediaJournal
    ```

---

If you want to access the app from outside your local Wi-Fi network, check the following guides:

<div markdown="1" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">

[Read the Remote Access Guide](../configuration/remote-access.md){ .md-button }
[Read the Authentication Guide](../configuration/authentication.md){ .md-button }

</div>
