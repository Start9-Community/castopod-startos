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
- **Configure Podcast Index** — saves your Podcast Index API key. See below.
- **Submit to Podcast Index** — lists a published podcast in Podcast Index and gives you links for other directories. See below.
- **Set Lightning Address** — lets listeners send your podcast Lightning payments. See below.

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

### Listing your podcast in Podcast Index and other directories

[Podcast Index](https://podcastindex.org) is an open podcast directory. Many podcast apps search it, including Fountain, Podverse, Castamatic, Podcast Guru and AntennaPod. Once your podcast is in Podcast Index, those apps can find it without any further steps.

Before you start:

- Your **primary URL must be a public domain**. Podcast Index reads your feed from the internet, so a `.onion`, `.local` or home-network address won't work.
- The podcast must be **published** in Castopod. Unpublished podcasts have no public feed.

1. Create a free account at [api.podcastindex.org](https://api.podcastindex.org). You get an API key and a secret, and you need both.

   New keys are **read-only**. A read-only key can check and track your podcast, but can't add it. You have two options:
   - Ask Podcast Index to give your key write access. Then this package adds the podcast for you.
   - Add the podcast yourself at [podcastindex.org/add](https://podcastindex.org/add), which needs no account. Paste the feed URL: your primary URL followed by `/@<your podcast handle>/feed.xml`. After a few minutes, run **Submit to Podcast Index**, which finds the listing and tracks it.
2. Run **Configure Podcast Index** and enter the key and secret.
3. Run **Submit to Podcast Index**, pick the podcast, and tick any other directories you want to be listed in.
4. The result shows your feed URL and a link to your podcast's page on podcastindex.org. It also has one link for each directory you ticked.

Apple Podcasts, Spotify, YouTube Music, Amazon Music and the other big directories have no way to add a podcast automatically. For each one, open its link, sign in with your account there, and paste your feed URL. Once a listing is live, add its link in Castopod's Admin Area under **Broadcast → Podcasting apps**, so it shows on your podcast page.

Fountain is different: it picks up podcasts from Podcast Index by itself, so there's nothing to submit there. If you tick **Fountain (claim your show)**, the result links to Fountain's guide to claiming your show. Claiming lets you manage the show and receive listener payments in the Fountain app. Fountain checks that you own the show by emailing the owner address in your feed, so make sure **Remove the owner email from the public RSS feed** is turned off in your podcast's settings in Castopod while you claim it.

The **Podcast Index** health check shows how your submitted podcasts are doing. It usually turns green within minutes, showing the episode count and when Podcast Index last read your feed. If it reports a problem, check that your feed URL opens from a device outside your home network. It also tells you if your primary URL has changed since you submitted. Running **Submit to Podcast Index** again for the same podcast asks Podcast Index to read your feed again straight away.

The health check only shows Podcast Index. Apple, Spotify and the other directories can't be checked from here.

### Receiving Lightning payments from listeners

Podcast apps such as Fountain, Podverse and Castamatic let listeners send Lightning payments to podcasts: a "boost" with a message, or a few sats for every minute they listen. This is called value for value. To receive them, put a Lightning address in your podcast's feed.

1. Get a Lightning address from a wallet that supports it, for example `you@getalby.com` from Alby or `you@fountain.fm` from Fountain.
2. Run **Set Lightning Address**, pick the podcast and enter the address.
3. Castopod restarts to publish the change. It is offline for about a minute, and anyone signed in has to sign in again.

All payments go to that one address. Apps notice the change the next time they refresh your feed. If you submitted the podcast to Podcast Index, the **Podcast Index** health check shows "Lightning payments" once the index has picked it up.

Some wallets, such as some exchange wallets, don't publish the details most apps need. The action still adds the address in that case, but fewer apps can pay it. Alby and Fountain work with all of them. If your wallet ever changes, run the action again with the same address.

To stop receiving payments, run the action with the address left empty. The setting also appears in Castopod's own podcast settings under **Custom RSS tags**, where you can edit it by hand.

### Federation and your home IP address

Castopod contacts other servers itself: it delivers your posts to followers' fediverse servers and fetches their profiles. If you publish Castopod through a tunnel to keep your home IP private, send Castopod's outbound traffic through that tunnel too, or the servers it contacts see your home IP. If you use a tunnel for another reason, there is nothing to change.
