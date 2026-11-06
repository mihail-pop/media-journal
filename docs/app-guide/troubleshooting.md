# Troubleshooting

---

### YouTube "Video unavailable" Error

**The Problem:**  
When playing trailers or music within the app, you might encounter a black screen with the message: *"Video unavailable, watch on YouTube."*

**The Cause:**  
YouTube can block embedded playback for many popular videos when Media Journal is accessed through a numeric IP address, like `http://192.168.1.15:8000` or `http://127.0.0.1:8000`. If many or most videos aren't playing, this is the first thing to check.

**The Solutions:**  
Use a named address instead of the numeric IP. Here are some options depending on your setup:

1. **Host Machine (Localhost):**  
   If you are on the same computer where the app is installed, simply use `http://localhost:8000` instead of the IP address.

2. **Tailscale (Private Remote Access):**  
   If you use Tailscale to access the app across your devices, you can use your Tailscale machine name or MagicDNS URL instead of the IP address. *(See [Remote Access](../configuration/remote-access.md))*

3. **Cloudflare Tunnels (Public Remote Access):**  
   A configured domain such as `https://your-domain.com` gives you a named HTTPS address for accessing the app. *(See [Remote Access](../configuration/remote-access.md))*

4. **Local DNS:**  
   If you only want to fix this on your home network without exposing the app, you can set up a local DNS (either in your router settings or by running an app like Pi-hole). This allows you to assign a custom local name like `http://mediajournal.local:8000`.

> **Note:** An individual video can also fail because it was deleted, made private or does not allow embedded playback.

---

### Music Pop-out Does Not Open

Allow pop-ups for your Media Journal address, then try the pop-out control again. The player opens a separate browser window; it is not an always-on-top picture-in-picture window. Closing that window stops the player.

### CSV Rows Are Unmatched or Skipped

Check the selected media type, column mappings, score scale and date format. Provider IDs help avoid title ambiguity; AniList imports accept MyAnimeList IDs too. MusicBrainz IDs must identify recordings, and diary exports with repeated viewings need to be reduced to one row per item.

Search Again searches the title currently in its input. Replace a misspelled or fictional title with a real one, then choose Use This on a result. You still need to press Import Matched Items afterwards. An item already in your library is skipped and kept unchanged.

You can download the unimported CSV with the original fields for rows that need correcting. See [CSV Import and Export](how-to-use.md#272-csv-import-and-export) for the full workflow.

### Home Screen Installation Is Missing

Open your own HTTPS address rather than an HTTP IP address or machine name. If you use Tailscale, [Tailscale Serve](../configuration/remote-access.md#https-with-tailscale-serve) can provide this privately. On iPhone, use Safari's Share > Add to Home Screen. Installation options vary by browser, and the server must still be reachable after installation.
