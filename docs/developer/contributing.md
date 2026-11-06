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
