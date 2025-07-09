<h1 align="center">Media Journal</h1>

<h3 align="center">
  A media tracker app designed to be clean, simple to use, and reliable with APIs.
</h3>
<br/>

<div align="center"> I will use this app from now on for my media, so I will keep it maintained. If others join me and find it useful too, even better. </div>


## Features

- Separate lists for movies, tv shows, games, anime, manga, and books.
- Track progress, ratings, status, and personal notes.
- Home page shows stats, favorites, and recent activity.
- You can also favorite actors and characters.
- Saves your lists and images locally (less than 1MB per item).
- Import/export your data for backup or transfer.
- Automatically checks for sequels and new seasons (tv shows, anime, manga).

## Demo  
| <img src="https://github.com/user-attachments/assets/9dfbe6f7-56eb-425d-8f8f-72362dd43416" width="500" /> | <img src="https://github.com/user-attachments/assets/1d5f49cb-7f0b-4fd7-93ba-5c77c8266884" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home                    |               Movies                   |

| <img src="https://github.com/user-attachments/assets/0b9027f5-60bb-4f46-8f39-913995805068" width="500" /> | <img src="https://github.com/user-attachments/assets/65ef3080-67b1-424a-a894-1276284c2567" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Details                  |               Edit                   |







## Setup

### If you have Docker 
1. Open a terminal in the project folder and run:
   ```sh
   docker-compose build
   ```
2. Then, for this and all future runs, start the app with:
   ```sh
   docker-compose up
   ```
3. Now you can open the app in your browser at: http://localhost:8000

4. Inside the app navigate to **Settings → API Keys**.
   You will need to add your own API keys. In that section there are instructions on how to obtain them.

### Windows

1. Download [Python 3.13.0](https://www.python.org/downloads/release/python-3130/).

   During installation check the option:  
   *“Add Python to PATH”*.

2. Download the project:  
   Click the green **Code** button → **Download ZIP** → Extract it to your desired location. (Or you can use Git)

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
