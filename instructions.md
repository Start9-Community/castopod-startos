# Castopod

## Documentation

- [Castopod user guide](https://docs.castopod.org/main/en/user-guide/*) — managing your instance, podcasts, episodes, the fediverse and your website.

## What you get on StartOS

- Two interfaces: **Podcast Website**, the public site, RSS feeds and media your listeners and podcast apps use; and **Admin Area**, where you manage your podcasts.
- A private database and your uploaded media. Both are included in StartOS backups unless you keep the media in another service (see below).
- Actions for the owner password, the owner email, the address Castopod publishes under, email sending and two-factor sign-in. Castopod's own install wizard is skipped: the owner account is created for you.

## Getting set up

1. Run **Set Admin Password** when prompted. Save the email and password it shows you.
2. Run **Set Primary URL** and choose the address your podcast will be published under. Every RSS feed, media link and fediverse identity is built from it, and podcast apps keep the links they are given, so choose carefully before you publish. To list your podcast in Apple Podcasts, Spotify and other directories, or to federate with the fediverse, this must be a public domain (HTTPS). A `.local` address only works on your home network.
3. Start Castopod and open the **Admin Area** interface. Sign in with the **email** from step 1 (`admin@castopod.local`), not a username.
4. Run **Set Owner Email** to replace the placeholder with your real address. You will sign in with the new address from then on.
5. Optionally run **Configure SMTP** so Castopod can send password-reset emails and contributor invitations.
6. Create your first podcast from the admin area, following [Create a podcast](https://docs.castopod.org/main/en/getting-started/create-podcast/).

## Using Castopod

### Interfaces

- **Podcast Website** — what listeners see: your podcast pages, players and RSS feeds. This is the address you share and submit to podcast directories.
- **Admin Area** — where you create podcasts and episodes, upload audio, and manage users and settings.

Both live at the same address (the admin area is its `/cp-admin` page), so making the website public also makes the admin sign-in page reachable; protect it with a strong password, as you would upstream. Opening Castopod on another of its addresses works, but after signing in you are sent to the primary URL.

### Actions

- **Set Admin Password** — generates a new password for the owner account and applies it immediately. Use it if you lose the password.
- **Set Owner Email** — changes the email you sign in with. Castopod's own settings pages cannot change it.
- **Set Primary URL** — changes the address Castopod publishes under. Changing it after you have published breaks existing feed subscriptions and fediverse follows.
- **Configure SMTP** — lets Castopod send email.
- **Media Storage** — chooses where Castopod keeps its media. See below.
- **Delete Internal Media Copy** — after moving media to another service, deletes the copy left in Castopod's own storage.
- **Enable / Disable Email Two-Factor Authentication** — requires a code sent by email on every sign-in, for every account. It needs SMTP and a real owner email. If email delivery breaks, nobody can sign in until you run the action again to turn it off. Test that mail arrives (for example with a password-reset email) before turning it on.

### Keeping media in NextExplorer, FileBrowser Quantum or Nextcloud

Castopod can keep its media (episode audio, artwork, transcripts and clips) in a folder of another service instead of its own storage. You can then see and download the files there, and that service's storage holds them.

This changes where Castopod **stores** files, not how you add them. Castopod never scans the folder: files you put there yourself are ignored. Always add episodes through Castopod's **Admin Area** (**Episodes → New episode**, then upload the audio file); Castopod then saves the file into the folder.

1. Install NextExplorer, FileBrowser Quantum or Nextcloud.
2. Back up Castopod.
3. Run **Media Storage**, pick the service and enter a new or empty folder:
   - **NextExplorer** — e.g. `Castopod`, which appears as its own location, or `Files/Castopod` inside the Files location.
   - **FileBrowser Quantum** — e.g. `Castopod`.
   - **Nextcloud** — inside an account's files: `data/<account>/files/Castopod`, e.g. `data/admin/files/Castopod`.
4. Castopod restarts and copies all existing media to the new folder before it comes back. That takes a while for a large library; watch the logs. The old copy is kept.
5. Once you have checked everything plays and that service is backed up, run **Delete Internal Media Copy** to free the space the old copy uses.

Things to know:

- **Backups.** Media in another service is backed up by that service, not by Castopod. Keep both backed up, and restore both together.
- **Don't edit Castopod's folder by hand.** Renaming or deleting files there breaks the episodes that use them. If the folder or the service disappears, Castopod won't start until it is back. You can also run **Media Storage** and choose **Internal storage** to fall back to the copy Castopod kept.
- **Nextcloud** doesn't show files Castopod writes until it rescans its files.
- To move again, run **Media Storage** with a different location. Choosing the current location cancels a move that hasn't run or that failed.

### Federation and your home IP address

Castopod contacts other servers itself: it delivers your posts to followers' fediverse servers and fetches their profiles. If you publish Castopod through a tunnel to keep your home IP private, send Castopod's outbound traffic through that tunnel too, or the servers it contacts see your home IP. If you use a tunnel for another reason, there is nothing to change.
