# Contributing

If you want to contribute to the code, fix a bug or add a small feature you are more than welcome to do so. If you plan to make a big change or a major new feature please ask me first (like opening an issue) so you don't waste your time in case it's something I wouldn't merge.

## Branching Strategy

The repository has two main branches:

* **`main`**: The stable release branch. This is what users download when they install the app.
* **`development`**: The branch where I implement new things and test them before I merge them to the main branch.

> **Note:** All Pull Requests should be made against the **`development`** branch. Once a set of features is stable I will merge them into `main`, draft a new release and make a new Docker image.

## Development Environment (DEBUG Mode)

In `settings.py`, debug mode is configured to read an environment variable:
```python
DEBUG = os.environ.get('MJ_DEV') == 'True'
```
This is done so that running the app normally on your machine defaults to `DEBUG=False` (production behavior), but when you open and run the app inside Visual Studio Code you automatically get `DEBUG=True` with live reload and detailed error pages.

To configure this in VS Code create a `.vscode/settings.json` file in the root folder of the project and add the `MJ_DEV` variable for your operating system:

=== "Windows"

    ```json
    {
        "terminal.integrated.env.windows": {
            "MJ_DEV": "True"
        }
    }
    ```

=== "Mac"

    ```json
    {
        "terminal.integrated.env.osx": {
            "MJ_DEV": "True"
        }
    }
    ```

=== "Linux"

    ```json
    {
        "terminal.integrated.env.linux": {
            "MJ_DEV": "True"
        }
    }
    ```

After saving the file any new terminal you open inside VS Code will automatically run with `MJ_DEV=True`.

## How-to: Adding a New Theme

If you would like to make your own theme and share with others (and you have some knowledge in coding/css/designing) here is how you can do it:

### 1. Update the Database Model
Open `models.py` and find the `AppSettings` model. Add your new theme name to the `theme_mode` choices tuple.

```python
    theme_mode = models.CharField(
        max_length=20,
        choices=[
            ('light', 'Light'),
            ('dark', 'Dark'),
            ('brown', 'Brown'),
            ('green', 'Green'),
            ('my_new_theme', 'My New Theme'), # Add it here
        ],
        default='dark'
    )
```

> **Note:** Do not run `makemigrations` and `migrate` yourself. The app will still work without it (it will just throw a small warning in the CMD). I will handle the migrations myself after the pull request is merged so we avoid pointless migration conflicts.

### 2. Update the CSS Files
The app doesn't use one single CSS file for themes. Instead different pages define their own CSS variables. You will need to open the relevant CSS files (like `g_create_modal.css`) and add a new `[data-theme="my_new_theme"]` block underneath the existing themes.

```css
:root {
  --bg-primary: #0b1622;
  --button-primary: #3db4f2;
}

/* Existing themes */
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --button-primary: #3db4f2;
}

[data-theme="brown"] {
  --bg-primary: #271c19;
  --button-primary: #8f5b4d;
}

/* Add your new theme variables here */
[data-theme="my_new_theme"] {
  --bg-primary: #YOURCOLOR;
  --button-primary: #YOURCOLOR;
}
```

Because variables can change from page to page you will need to click around most pages in the app to make sure your new colors fit well everywhere.

### 3. Update the Settings HTML
Go to `p_settings.html` and add the button for your new theme inside the theme selector section. You can also style how this specific button looks in the UI by editing `p_settings.css`.

```html
      <div class="preferences-section">
        <h3>Theme</h3>
        <div class="theme-selector">
          <div class="theme-option {% if theme_mode == 'dark' %}active{% endif %}" data-theme="dark">
            <div class="theme-cube theme-dark">D</div>
            <span>Dark</span>
          </div>
          <!-- Add your new option here -->
          <div class="theme-option {% if theme_mode == 'my_new_theme' %}active{% endif %}" data-theme="my_new_theme">
            <div class="theme-cube theme-my-new-theme">M</div>
            <span>My Theme</span>
          </div>
        </div>
      </div>
```

### 4. Update the Settings View
Finally open `views/settings.py`, locate the `update_theme` function and add your new theme name to the allowed list so the backend accepts it.

```python
@require_POST
def update_theme(request):
    data = json.loads(request.body.decode("utf-8"))
    theme_mode = data.get("theme_mode")

    # Add your theme to this list
    if theme_mode not in ["light", "dark", "brown", "green", "my_new_theme"]:
        return JsonResponse({"error": "Invalid theme mode"}, status=400)

    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    if not settings:
        settings = AppSettings.objects.create()

    settings.theme_mode = theme_mode
    settings.save()

    return JsonResponse({"success": True})
```

Once you are done test the app locally to make sure the theme applies smoothly and submit your Pull Request to the `development` branch!