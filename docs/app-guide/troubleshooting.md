# Troubleshooting

---

### YouTube "Video unavailable" Error

**The Problem:**  
When playing trailers or music within the app, you might encounter a black screen with the message: *"Video unavailable, watch on YouTube."*

**The Cause:**  
YouTube blocks embedded playback for certain copyrighted videos (especially music) when the website requesting it uses a raw, numeric IP address (e.g., `http://192.168.1.15:8000` or `http://127.0.0.1:8000`). 

**The Solutions:**  
To fix this, you need to access Media Journal using a named URL instead of numbers. You have a few options depending on your setup:

1. **Host Machine (Localhost):**  
   If you are on the same computer where the app is installed, simply use `http://localhost:8000` instead of the IP address.

2. **Tailscale (Private Remote Access):**  
   If you use Tailscale to access the app across your devices, you can use your Tailscale machine name or MagicDNS URL instead of the IP address. *(See [Remote Access](../configuration/remote-access.md))*

3. **Cloudflare Tunnels (Public Remote Access):**  
   If you expose the app to the internet using a real domain name (e.g., `https://your-domain.com`), YouTube videos will work perfectly across all devices. *(See [Remote Access](../configuration/remote-access.md))*

4. **Local DNS:**  
   If you only want to fix this on your home network without exposing the app, you can set up a local DNS (either in your router settings or by running an app like Pi-hole). This allows you to assign a custom local name like `http://mediajournal.local:8000`.