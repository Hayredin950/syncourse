#!/usr/bin/env python3
"""
Recover a Telegram channel into another chat by forwarding every post.

This exists for the case where the content is yours but the original account
(or client) is gone: the new account reads the public channel and forwards
each post, keeping the source attribution and the original media, captions,
poll, album and formatting exactly as posted.

It is not a scraper for other people's channels. If the channel is not yours
or you do not have permission to redistribute it, do not run this.

How it works
------------
Telegram's Bot API cannot read a channel's history, so this is a Telethon
(MTProto) *user* session. The account you sign in with must be able to read
the source and must be a member/admin of the destination.

Albums are buffered by `grouped_id` and forwarded as one album; service
messages and empty posts are skipped. Progress is written to state.json after
every successful post, so an interrupted run resumes at the right message
instead of duplicating the channel.

Usage
-----
    python forward.py --check
    python forward.py --dry-run --limit 20
    python forward.py --limit 500
    python forward.py --yes

See README.md for setup.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Sequence

from dotenv import load_dotenv
from telethon import TelegramClient, errors
from telethon.tl.custom.message import Message
from telethon.tl.functions.messages import GetHistoryRequest

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

STATE_FILE = Path(os.getenv("STATE_FILE", ROOT / "state.json"))
SESSION_NAME = os.getenv("TG_SESSION", str(ROOT / "recover"))

# One forward per 1.5s is still ~2,400 posts/hour and is kind to a new account.
DEFAULT_DELAY = 1.5
# Telegram caps an album at 10 items; the buffer flushes at the same size.
MAX_ALBUM = 10
# How many times a FloodWait is slept through before giving up on one post.
MAX_FLOOD_RETRIES = 10


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        sys.exit(
            f"Missing {name}. Copy .env.example to .env and fill it in — see README.md."
        )
    return value


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"last_id": 0, "forwarded": 0, "albums": 0, "skipped": 0, "failed": 0}
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        sys.exit(f"Could not read {STATE_FILE}: {exc}. Delete it to start over.")


def save_state(state: dict[str, Any]) -> None:
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(STATE_FILE)


def target(value: str) -> str | int:
    """A username stays a string; a numeric chat id becomes an int."""
    return int(value) if value.lstrip("-").isdigit() else value


async def with_flood_wait(call: Callable[[], Awaitable[Any]], what: str) -> Any:
    """Run a Telegram call, sleeping through FloodWait instead of dying."""
    for attempt in range(1, MAX_FLOOD_RETRIES + 1):
        try:
            return await call()
        except errors.FloodWaitError as exc:
            wait = exc.seconds + 3
            log(f"FloodWait on {what}: sleeping {wait}s (attempt {attempt})")
            await asyncio.sleep(wait)
    raise RuntimeError(f"Still flood-waited after {MAX_FLOOD_RETRIES} attempts on {what}")


def is_forwardable(message: Message) -> bool:
    # Service messages (joins, pins, title changes) and empty posts carry nothing.
    if message.action is not None:
        return False
    return bool(message.message or message.media)


async def forward_batch(
    client: TelegramClient,
    src: Any,
    dst: Any,
    batch: Sequence[Message],
    topic: int | None,
) -> int:
    """
    Forward one post, or one album, as a unit.

    Returns how many messages made it. When an album is refused as a whole it
    falls back to one-by-one forwarding, so one expired file cannot stop the
    rest of the post.
    """
    ids = [m.id for m in batch]
    as_album = len(ids) > 1

    async def send(group: Sequence[int], album: bool) -> None:
        await client.forward_messages(
            dst,
            list(group),
            from_peer=src,
            as_album=album,
            top_msg_id=topic,
        )

    try:
        await with_flood_wait(lambda: send(ids, as_album), f"album {ids[0]}")
        return len(ids)
    except errors.ChatForwardsRestrictedError:
        raise
    except Exception as exc:  # noqa: BLE001 - Telegram raises a wide variety here
        log(f"Forward of {ids} failed ({type(exc).__name__}: {exc}); retrying one by one")

    sent = 0
    for message in batch:
        try:
            await with_flood_wait(
                lambda message=message: send([message.id], False), f"message {message.id}"
            )
            sent += 1
        except errors.ChatForwardsRestrictedError:
            raise
        except Exception as exc:  # noqa: BLE001
            log(f"  message {message.id} failed ({type(exc).__name__}: {exc})")
    return sent


def entity_kind(entity: Any) -> str:
    if getattr(entity, "broadcast", False):
        return "channel"
    if getattr(entity, "megagroup", False):
        return "supergroup"
    return "group"


async def check(
    client: TelegramClient,
    src: Any,
    dst: Any,
    state: dict[str, Any],
    topic: int | None,
) -> None:
    """Report what the account can actually do, without forwarding anything."""
    me = await client.get_me()
    log(f"Signed in as {me.first_name or me.username or 'account'} (id {me.id})")

    for label, entity in (("SOURCE", src), ("DEST", dst)):
        username = f"@{entity.username}" if getattr(entity, "username", None) else "—"
        log(f"{label}: {entity.title!r} · {entity_kind(entity)} · id {entity.id} · {username}")

    protected = bool(getattr(src, "noforwards", False))
    log(f"Source protected content ('Restrict saving'): {'YES — cannot forward' if protected else 'no'}")

    try:
        history = await client(GetHistoryRequest(
            peer=src, offset_id=0, offset_date=None, add_offset=0,
            limit=1, max_id=0, min_id=0, hash=0,
        ))
        newest = history.messages[0].id if history.messages else 0
        log(f"Source posts: {history.count} · newest message id {newest}")
        if newest and state["last_id"] >= newest:
            log("Resume point is already at the newest post — nothing new to forward.")
    except Exception as exc:  # noqa: BLE001
        log(f"Could not read source history: {type(exc).__name__}: {exc}")

    try:
        perms = await client.get_permissions(dst, me)
        can_post = bool(getattr(perms, "send_messages", False) or getattr(perms, "is_admin", False))
        log(
            "Can post in destination: "
            f"{'yes' if can_post else 'NO'} "
            f"(send_messages={getattr(perms, 'send_messages', None)}, "
            f"admin={getattr(perms, 'is_admin', None)}, "
            f"creator={getattr(perms, 'is_creator', None)})"
        )
    except Exception as exc:  # noqa: BLE001
        log(f"Could not read destination permissions: {type(exc).__name__}: {exc}")

    forum = bool(getattr(dst, "forum", False))
    log(f"Destination forum: {'yes' if forum else 'no'}" + (f" · DEST_TOPIC={topic}" if topic else ""))
    if topic and not forum:
        log("WARNING: DEST_TOPIC is set but the destination is not a forum — clear it.")

    log(f"Saved resume point: message id {state['last_id']}")


async def run(args: argparse.Namespace) -> None:
    api_id = int(env("TG_API_ID"))
    api_hash = env("TG_API_HASH")
    source = target(env("SOURCE"))
    destination = target(env("DEST"))
    topic = int(os.getenv("DEST_TOPIC", "0")) or None
    delay = float(os.getenv("DELAY", DEFAULT_DELAY))

    state = load_state()
    start_after = args.from_id if args.from_id is not None else state["last_id"]

    log(f"Source      : {source}")
    log(f"Destination : {destination}" + (f" (topic {topic})" if topic else ""))
    log(f"Resuming after message id {start_after or 'the beginning'}")
    if args.dry_run:
        log("DRY RUN — nothing will be sent and state will not be written")

    client = TelegramClient(SESSION_NAME, api_id, api_hash)
    await client.start(phone=os.getenv("TG_PHONE") or None)

    try:
        src = await client.get_entity(source)
        dst = await client.get_entity(destination)
    except errors.UsernameNotOccupiedError:
        sys.exit(f"{source} is not a public username. Pass its numeric id or an invite link.")
    except errors.ChannelPrivateError:
        sys.exit("That channel is private and this account cannot read it.")
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Could not resolve source/destination: {type(exc).__name__}: {exc}")

    if args.check:
        await check(client, src, dst, state, topic)
        await client.disconnect()
        return

    me = await client.get_me()
    log(f"Signed in as {me.first_name or me.username or 'account'}")

    # `seen` counts source messages, not forwards, so --limit is predictable
    # across albums and skipped service posts.
    seen = 0
    buffer: list[Message] = []
    started = time.time()

    def limit_hit() -> bool:
        return bool(args.limit) and seen >= args.limit and not buffer

    async def flush() -> None:
        nonlocal buffer
        if not buffer:
            return
        batch, buffer = buffer, []
        ids = [m.id for m in batch]

        if args.dry_run:
            kind = "album" if len(batch) > 1 else "post"
            preview = (batch[0].message or "").replace("\n", " ")[:60]
            log(f"would forward {kind} {ids}: {preview}")
            return

        try:
            sent = await forward_batch(client, src, dst, batch, topic)
        except errors.ChatForwardsRestrictedError:
            sys.exit(
                "The source channel has 'Restrict saving content' enabled, so even "
                "its owner cannot forward from a normal client. Disable it in the "
                "channel settings, or use Telegram Desktop's Export (see README)."
            )
        except Exception as exc:  # noqa: BLE001
            log(f"Batch {ids} failed completely ({type(exc).__name__}: {exc})")
            sent = 0

        state["forwarded"] += sent
        state["failed"] += len(batch) - sent
        if sent and len(batch) > 1:
            state["albums"] += 1
        state["last_id"] = max(state["last_id"], ids[-1])
        save_state(state)

        if state["forwarded"] and state["forwarded"] % 50 < sent:
            log(
                f"{state['forwarded']} forwarded · {state['albums']} albums · "
                f"last id {state['last_id']}"
            )
        await asyncio.sleep(delay)

    try:
        async for message in client.iter_messages(
            src, min_id=start_after, reverse=True, wait_time=1
        ):
            seen += 1

            if not is_forwardable(message):
                state["skipped"] += 1
                state["last_id"] = max(state["last_id"], message.id)
                if not args.dry_run:
                    save_state(state)
                if limit_hit():
                    break
                continue

            # Consecutive messages share a grouped_id; anything else starts a
            # new unit. The buffer flushes when the group ends or hits 10.
            if buffer and message.grouped_id != buffer[0].grouped_id:
                await flush()
                if limit_hit():
                    break

            buffer.append(message)

            if message.grouped_id is None or len(buffer) >= MAX_ALBUM:
                await flush()
                if limit_hit():
                    break
            # A limit reached in the middle of an album keeps reading until the
            # album ends, so --limit never splits one across two runs.
    finally:
        await flush()

    elapsed = time.time() - started
    log(
        f"Done. forwarded={state['forwarded']} albums={state['albums']} "
        f"skipped={state['skipped']} failed={state['failed']} in {elapsed:.0f}s"
    )
    if not args.dry_run:
        log(f"Resume point saved: message id {state['last_id']} in {STATE_FILE.name}")
    await client.disconnect()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Forward all posts from your own Telegram channel to another chat."
    )
    parser.add_argument("--check", action="store_true", help="diagnose access and permissions only")
    parser.add_argument("--dry-run", action="store_true", help="list what would be forwarded")
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="stop after N source messages this run (albums are not split)",
    )
    parser.add_argument(
        "--from-id",
        type=int,
        default=None,
        help="start after this message id instead of the saved state",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="ignore and replace state.json (use only to start over deliberately)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm a full run without a limit",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.reset and STATE_FILE.exists():
        STATE_FILE.unlink()
    if not args.limit and not args.dry_run and not args.check and not args.yes:
        sys.exit(
            "A full channel run is a lot of forwarding. Try --limit 20 first, then "
            "--limit 500, then add --yes for the whole history."
        )
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nStopped. Progress is saved — run the same command to resume.", flush=True)


if __name__ == "__main__":
    main()
