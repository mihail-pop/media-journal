from urllib.parse import urlsplit

from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse

class GlobalLoginRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.public_icon_prefix = urlsplit(settings.STATIC_URL).path.rstrip('/') + '/core/icons/'

    def __call__(self, request):
        # 1. If the toggle is OFF, let everyone in.
        if not getattr(settings, 'REQUIRE_LOGIN', False):
            # If they manually try to visit the login page while it's turned off, bounce them to home
            if request.path_info == reverse('login'):
                return redirect('home')
            return self.get_response(request)

        # 2. Prevent infinite loops: Always let people see the login page itself!
        if request.path_info == reverse('login'):
            return self.get_response(request)

        # Browsers fetch installation metadata and packaged branding icons
        # before login. Library pages and uploaded media still require login.
        if request.path_info == reverse('web_manifest') or request.path_info.startswith(self.public_icon_prefix):
            return self.get_response(request)

        # 3. If the user is logged in, let them access the requested file/page.
        if request.user.is_authenticated:
            return self.get_response(request)

        # 4. If we reach here: Toggle is ON, user is NOT logged in, 
        # and they are trying to view an image/page. Bounce them!
        return redirect('login')
