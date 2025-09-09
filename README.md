<h1 align="center">Media Journal</h1>

<h3 align="center">
  A media tracker app designed to be clean, simple to use, and reliable.
</h3>
<br/>

<div align="center"> I will use this app from now on for my media, so I will keep it maintained. If others find it useful too, even better! </div>


## Features

- Separate lists for movies, tv shows, games, anime, manga, and books.
- Track progress, ratings, status, and notes.
- Home page shows stats, recent activity and favorites (including actors and characters).
- Multiple rating systems (3 faces, 5 stars, 1-10, 1-100).
- Import/export your data for backup or transfer (no CSV imports from other sites).
- Automated check for sequels and new seasons (tv shows, anime, manga).
- Get status for planned movies, tv shows, anime, manga.

## Demo - [Youtube Demo](https://youtu.be/85DY-WM6cI4?si=u7q5AAbQnWaxTuQN)
| <img src="https://github.com/user-attachments/assets/0265ea9e-6404-4958-82c6-4318ecdeb848" width="500" /> | <img src="https://github.com/user-attachments/assets/2dcedab4-696b-47b5-a500-d9a2572dfa52" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home                    |               Movies                   |

| <img src="https://github.com/user-attachments/assets/9fe9a252-c403-48c0-8b51-66609fbeb491" width="500" /> | <img src="https://github.com/user-attachments/assets/3d18a302-8d04-4ac9-9897-779bb4460c45" width="500" /> |
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

## Licensing & Philosophy

I will never ask for donations or try to monetize this app in any shape or form.

I added the AGPL license to make it easier for possible contributors, but I disagree with the "commercial use" clause. Most likely, nobody will be interested in profiting from this app, and even if it is technically permitted under the license, I personally disapprove of it.

