<h1 align="center">Media Journal</h1>

This is the self-hosted media tracker app I always wanted to have. From now on I will use it and keep it maintained. I will never ask for donations or try to monetize the app in any form. People using it is more than enough!
> **Note:** I added the open source AGPL license to make contributing easier, hoping nobody would try to monetize the app with the "commercial use" clause. I personally disapprove of that.

## Features

- Separate lists for movies, tv shows, games, anime, manga, books and music.
- Track progress, ratings, status and notes.
- Home page shows stats, recent activity and favorites (including actors and characters).
- Multiple rating systems (3 faces, 5 stars, 1-10, 1-100).
- Play your saved songs through a YouTube music player while navigating the site.
- Automated check for sequels and new seasons (tv shows, anime, manga).
- Get status for planned movies, tv shows, anime, manga.

## Demo - [Youtube Demo](https://youtu.be/JXOvpvdVZpY?si=LIvj2CKixBAZ0Pp)
| <img src="https://github.com/user-attachments/assets/59ff70c5-46ce-4b69-a5ad-70e811b33f0b" width="500" /> | <img src="https://github.com/user-attachments/assets/48fdb9d3-aa17-4b2f-a8a2-173e5b2a3cb6" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home                    |               Movies                   |

| <img src="https://github.com/user-attachments/assets/91a077d6-10ed-46a3-af85-9576b21824cd" width="500" /> | <img src="https://github.com/user-attachments/assets/6de5cc3d-bf77-4b0d-90f3-71d33e62bf5f" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               History                  |               Discover                   |

| <img src="https://github.com/user-attachments/assets/613761d3-7ca5-4071-8c11-2aa51eba208f"  width="500" /> | <img src="https://github.com/user-attachments/assets/6b44aaec-4d52-40d6-99e1-08089493c9f5" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Details                  |               Edit                   |

## Setup for Docker
1. Clone the repository:
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```

2. Open a terminal in the project folder and start the app with:
    ```sh
    docker-compose up -d
    ```
  The application will be available at [http://localhost:8090](http://localhost:8090).
  
3. Inside the app, navigate to **Settings → API Keys**.  
   You will need to add your own API keys. In that section there are instructions on how to obtain them.

### Configuration

The application can be configured using environment variables.

- `CSRF_TRUSTED_ORIGINS`: A comma-separated list of trusted origins for POST requests. This is necessary if you are accessing the application from a different domain.

  For example, in `docker-compose.yml`:

  ```yaml
  environment:
    - CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://another-domain.com
  ```

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

### Optional Tips

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

- Some YouTube videos (especially music) may show “Video unavailable, watch on YouTube” if you use a numeric URL (e.g., `http://127.0.0.1:8000`). Those videos work on `http://localhost:8000` or a custom URL (e.g., `http://myapp.mediajournal:8000`). To use a custom URL across devices, you need local DNS, which many routers don’t support. The other option is hosting a local DNS app on your machine, but it would always have to be turned on.
