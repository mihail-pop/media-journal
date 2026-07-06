## Setup for Windows - [Youtube Tutorial](https://youtu.be/Kopjki76ZxM?si=iQCA4Pbh_YYu9Q7y)

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

### Tips

- Access the app from your phone or other devices on the same network using your machine's IPv4 address. You can find your IPv4 address by running `ipconfig` in the terminal.

- For windows, to automatically start the app, you can create a `.bat` file that runs the `runserver` command and a `.vbs` file in the shell:startup folder to start that bat file at startup (it will start after log on, if you want before log on you can make the app start as a service with nssm and the `.bat` file).

    Example `.bat` file:  
    ```sh
    @echo off  
    cd /d "C:\***path to your folder***\media-journal"  
    set PY="C:\***path to your python***\Python\Python313\python.exe"  
    %PY% manage.py migrate  
    %PY% manage.py collectstatic --noinput  
    %PY% manage.py runserver 0.0.0.0:8000 --noreload
    ```

    Example `.vbs` file:  
    ```sh
    Set WshShell = CreateObject("WScript.Shell")  
    WshShell.Run """C:\***path to your bat file***\run_journal.bat""", 0  
    Set WshShell = Nothing
    ```