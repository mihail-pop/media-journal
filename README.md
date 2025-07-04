## Overview

I’ve always wanted to build a simple, all-in-one media tracking app that keeps working even if an API goes down. **Media Journal** is my take on that idea.

The app includes all the core features I initially set out to implement. I use it myself and plan to maintain it for the years to come. Support for books will be added in the future, but beyond that, I don’t plan to introduce major new features—keeping it simple makes it easier to maintain and use.

### Main Features

- **Local Storage**:  All items added to your lists are saved locally, including their associated images (on average, less than 1 MB per item).
- **Automatic Updates**: TV shows, anime, and manga are checked automatically for sequels or new seasons.  
- **Data Portability**: Export and import your lists for backup or transfer.  
- **Organized Lists**: Separate categories for Movies, TV Shows, Anime, Manga, and Games.  
- **Detailed Tracking**: Record progress, scores, status, and notes for each entry.  
- **Personalized Dashboard**: You can see stats and favorites (including characters and actors) on the home page.

## Demo  
| <img src="https://github.com/user-attachments/assets/00012d40-b481-4e67-969a-cc7b99abf568" width="500" /> | <img src="https://github.com/user-attachments/assets/1d5f49cb-7f0b-4fd7-93ba-5c77c8266884" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home Page                    |               List Example                   |

| <img src="https://github.com/user-attachments/assets/8d4f32af-7adf-4f07-b048-2221cc245157" width="500" /> | <img src="https://github.com/user-attachments/assets/65ef3080-67b1-424a-a894-1276284c2567" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Details Page                  |               Edit                   |

## Requirements  
- **Python** (Developed with version **3.13.0**)  
- **Dependencies**: Install using the command below:  

```sh
pip install -r requirements.txt
```
## Setup

### Windows - Simple Step-by-Step Guide

1. Ensure Python is installed. During installation, **make sure to check** the option:  
   *“Add Python to PATH”*.

2. Download the project:  
   Click the green **Code** button → **Download ZIP** → Extract it to your desired location.

3. Open a terminal inside the project folder:  
   Right-click inside the extracted folder → Select **Open in Terminal**.

4. Install the dependencies by running:  
   ```sh
   pip install -r requirements.txt
   ```
   Tip: If you work with multiple Python projects, consider creating a virtual environment (venv) before installing dependencies. Otherwise, you can skip this step.
   
6. Create the db.sqlite3 by running:
   ```sh
   python manage.py makemigrations
   python manage.py migrate
   ```
7. Start the app by running:
   ```sh
   python manage.py runserver
   ```
8. Now you can open the app in your browser at: http://localhost:8000
9. Navigate to **Settings → API Keys** in the app.
   Here you will need to add your API keys — instructions on how to obtain them are provided in that section.

### Optional Tips

- To easily start the app in the future, you can create a `.bat` file that runs the command and hides the terminal window.  
  You can even set this `.bat` file to run automatically at Windows startup or user logon, so you don’t have to worry about starting the app manually.

- To access the app from your phone or other devices on the same network, run the server using your PC’s IPv4 address instead of `localhost`:

  ```sh
  python manage.py runserver <IPv4_address>:8000
  ```
   You can find your IPv4 address by running `ipconfig` in the terminal.
