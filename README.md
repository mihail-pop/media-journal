<h1 align="center">Media Journal</h1>

This is the self-hosted media tracker app I always wanted to have. From now on I will use it and keep it maintained. I will never ask for donations or try to monetize the app in any form. People using it is more than enough!
> **Note:** I added the open source AGPL license to make contributing easier, hoping nobody would try to monetize the app with the "commercial use" clause. I personally disapprove of that.

## Features

- Separate lists for movies, tv shows, games, anime, manga, and books.
- Track progress, ratings, status, and notes.
- Home page shows stats, recent activity and favorites (including actors and characters).
- Multiple rating systems (3 faces, 5 stars, 1-10, 1-100).
- Import/export your data for backup or transfer (no CSV imports from other sites).
- Automated check for sequels and new seasons (tv shows, anime, manga).
- Get status for planned movies, tv shows, anime, manga.

## Demo - [Youtube Demo](https://youtu.be/85DY-WM6cI4?si=u7q5AAbQnWaxTuQN)
| <img src="https://github.com/user-attachments/assets/bb3275ec-116c-4edc-b663-f5bc807db3eb" width="500" /> | <img src="https://github.com/user-attachments/assets/40c7600f-86ce-492d-8c4a-d720553f0436" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home                    |               Movies                   |

| <img src="https://github.com/user-attachments/assets/384e1df9-db92-44ee-bf74-5d3237c47fe6" width="500" /> | <img src="https://github.com/user-attachments/assets/f567bff6-c6ad-43f8-87b8-21d2a1cf4295" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               History                  |               Discover                   |

| <img src="https://github.com/user-attachments/assets/e030c577-5d06-4ffa-927a-646977ab2209"  width="500" /> | <img src="https://github.com/user-attachments/assets/7f265f43-55fe-4767-a2ae-3836a579eb4a" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Details                  |               Edit                   |

## Setup for Docker
1. Clone the repository:
    ```sh
    git clone https://github.com/mihail-pop/media-journal
    ```

2. Open a terminal in the project folder and start the app with:
    ```sh
    docker-compose up
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

## Setup for Windows - [Youtube Tutorial](https://youtu.be/AGMv3L0hziY)

1. Download [Python 3.13.0](https://www.python.org/downloads/release/python-3130/).

   During installation check the option:
   *“Add Python to PATH”*.

2. Download the project:
   Click the green **Code** button → **Download ZIP** → Extract it to your desired location. (Or you can use git clone)

3. Open a terminal inside the project folder:
   Right-click inside `...\media-journal-main\media-journal-main` → Select **Open in Terminal**.

4. Install the dependencies:
   ```sh
   pip install -r requirements.txt
   ```

5. Create the database:
   ```sh
   python manage.py migrate
   ```
6. Start the app:
   ```sh
   python manage.py runserver
   ```
7. Open the app in your browser at: http://localhost:8000
8. Inside the app navigate to **Settings → API Keys**.
   You will need to add your own API keys. In that section there are instructions on how to obtain them.

### Optional Tips

- To easily start the app in the future, you can create a `.bat` file that runs the `runserver` command and a `.vbs` file in the shell:startup folder to start that bat file at startup.

- To access the app from your phone or other devices on the same network, run the server using your PC’s IPv4 address instead of `localhost`:

  ```sh
  python manage.py runserver <IPv4_address>:8000
  ```
   You can find your IPv4 address by running `ipconfig` in the terminal.
