# Telegram channel recovery

Forward every post from a channel into another chat, preserving the original
media, captions, formatting, polls and albums — for recovering your own channel
onto a new account.

This uses a **Telethon user session** (MTProto). The Bot API cannot read a
channel's history, and a bot cannot forward posts it never saw. The account you
sign in with reads the public source and forwards into the destination; the
posts keep their “Forwarded from …” attribution, which is the cleanest proof
they came from the original channel.

> Only use this on a channel you own or have permission to redistribute.
> It does not bypass “Restrict saving content”, and it does not copy anything
> privately — it forwards what the signed-in account can already read.

## What it handles

- **Albums** are buffered by `grouped_id` and forwarded as one album, not five
  loose files. `--limit` never splits an album across runs.
- **Service messages** (joins, pins, title changes) and empty posts are skipped.
- **Resume**: `state.json` records the last forwarded message id after every
  successful post. Stop with Ctrl+C, run the same command again, and it
  continues where it left off — no duplicates.
- **FloodWait** is slept through instead of crashing the run.
- **Formatting** is untouched because this is a forward, not a re-upload.

## 1. Telegram credentials

1. Open <https://my.telegram.org> → **API development tools**.
2. Create an app (any name) and copy its **api_id** and **api_hash**.
3. Make sure the account you will sign in with:
   - can open the source channel (public channels are readable without
     joining, but joining makes rate limits friendlier),
   - is a **member with permission to post** in the destination,
     otherwise it will get `CHAT_WRITE_FORBIDDEN`.

## 2. Install

```bash
cd tools/telegram-recover
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
$EDITOR .env          # api id/hash, source, destination
```

Leave `TG_PHONE` blank if you prefer to be prompted. On the first run Telegram
asks for the login code (and 2FA password if set); after that the
`recover.session` file keeps you signed in. Treat that file like a password —
it is gitignored.

## 3. Check access first

If a run seems to do nothing, run the diagnostic. It signs in, then reports
what the account can actually see and do — without forwarding anything:

```bash
.venv/bin/python forward.py --check
```

It prints both chats (title, kind, id, username), whether the source has
**Restrict saving content** on, how many posts exist and the newest message
id, whether the account may post in the destination, whether the destination
is a forum, and the saved resume point. The common answers:

- `Source posts: 0` — there is nothing there to forward.
- `Can post in destination: NO` — make the account an admin of `DEST`.
- `Resume point is already at the newest post` — an earlier run consumed the
  history, so nothing is left. Use `--reset --from-id 0` only if you really
  want to forward it again.

## 4. Dry run, then batches

```bash
# See what it would forward; no messages sent, no state written.
.venv/bin/python forward.py --dry-run --limit 20

# Forward 20 source messages (albums count as their members).
.venv/bin/python forward.py --limit 20

# Check them in Telegram, then continue in batches.
.venv/bin/python forward.py --limit 500

# Whole remaining history. --yes is required for an unlimited run.
.venv/bin/python forward.py --yes
```

For a long channel, run it inside `tmux`/`screen` or with `nohup`:

```bash
tmux new -s recover
.venv/bin/python forward.py --yes
# detach: Ctrl+B then D
```

Reattach with `tmux attach -t recover`.

## Destination topic

`t.me/somegroup/824` is normally a link to message 824 in the group, not a
topic. If the group is a **forum** and you want everything inside one topic,
set that topic's top-message id:

```env
DEST_TOPIC=824
```

Leave `DEST_TOPIC` empty to post in the group's main chat. If Telegram answers
`TOPIC_ID_INVALID` or the messages appear in the wrong place, clear it and retry
a single batch; nothing is lost because state only moves after a successful
forward.

## When it stops

| Error | Meaning / fix |
| --- | --- |
| `CHAT_FORWARDS_RESTRICTED` | The source has **Restrict saving content** on. Only the channel owner can turn it off (Channel settings → Restrict saving content). There is no client-side workaround, and this script deliberately has none. |
| `CHAT_WRITE_FORBIDDEN` | The account cannot post in `DEST`. Make it an admin or a member with post rights. |
| `FLOOD_WAIT_X` | Handled automatically; the log shows the sleep. |
| `USERNAME_NOT_OCCUPIED` | `SOURCE`/`DEST` is wrong, or the channel is private — use its numeric id (`-100…`) or an invite link. |
| `AUTH_KEY_UNREGISTERED` | The session was revoked. Delete `recover.session` and sign in again. |

A brand-new Telegram account has tighter limits. Keep `DELAY` at `2` or more,
run a few hundred posts, and let the account rest between batches.

## If the channel has protected content

If “Restrict saving content” was enabled and you no longer control the account
that can turn it off, forwarding is not possible from any client — that is the
point of the setting. The remaining option is Telegram Desktop's official
**Settings → Advanced → Export Telegram data** for chats you can access, then
uploading the exported files manually or with your own bot. That path loses the
original post structure and is outside what this script does.

## Files

| File | Purpose |
| --- | --- |
| `forward.py` | the forwarder |
| `.env` | your credentials and source/destination (gitignored) |
| `recover.session` | Telegram login session (gitignored — keep private) |
| `state.json` | last forwarded id and counters (gitignored) |
