# Denon power-cycling diagnosis

Tooling and a triage order for a Denon/Marantz AVR that keeps turning itself on
and off.

## Read this first: what I can and can't see

I run in a throwaway cloud container, not on your LAN. This one was built at
02:36 and had no route off itself (`192.0.2.2`, a documentation-only range).
Being on your Ubiquiti network doesn't expose it to me — UniFi is a great
vantage point, but it's *your* vantage point, not a shared one.

I also can't read previous sessions. Each session gets a fresh container and
starts with no history. I checked for prior context before saying so:

- `~/.claude/projects/` — only this session's own transcript
- this git repo — one commit, `Initialize repository`, a single empty `.gitkeep`
- Notion, Google Drive, Dropbox, Gmail — searched for Denon/Marantz/HEOS, nothing

That's the gap worth closing, and it's why this file exists. Anything we work
out should get written down **here** and committed, because the repo is the only
thing that survives to the next session. Findings recorded in chat are gone when
the container is reclaimed.

## Fastest path: bisect before you instrument

Two unplugging tests kill most of the possibility space in about twenty
minutes, no software required. Do these before anything else.

**Test 1 — pull every HDMI cable from the receiver.** Leave it powered, no HDMI
attached, for as long as a normal cycle takes plus a margin.
*Still cycles* → not CEC, go to Test 2. *Stops* → it's HDMI-CEC, which is the
single most common cause. Reconnect sources one at a time to find which box is
doing it.

**Test 2 — take it off the network.** Unplug the Ethernet cable (or turn off
Wi-Fi in its network menu).
*Stops* → something on your network is sending it power commands. *Still
cycles with no HDMI and no network* → it is not being commanded by anything.
That leaves protection mode or power delivery, both physical.

Everything below is for identifying the specific culprit once you know the class.

## The tool

Stdlib Python 3.8+, no dependencies. Run it from a machine on the same
subnet/VLAN as the receiver.

```bash
python3 denon_watch.py discover                          # find it
python3 denon_watch.py info    --host 192.168.1.50       # model + relevant settings
python3 denon_watch.py monitor --host 192.168.1.50 --log denon.log
#   ... leave running until it has misbehaved 3-4 times ...
python3 denon_watch.py analyze denon.log                 # name the cause
sudo python3 denon_watch.py sniff --host 192.168.1.50    # who is commanding it
```

`monitor` works because the receiver pushes every state change to anything
connected on TCP 23, unprompted. You get a timestamped record of power, zone,
and input transitions in the order they actually happened — which is the thing
that distinguishes causes that all look identical from the sofa.

`analyze` reads that log and matches it against known signatures:

| Signature in the log | Cause |
|---|---|
| Power events within 5s of an input change | HDMI-CEC — a source device is driving it |
| ON periods clustered at ~15/30/60 min, low spread | Auto Standby timer |
| ON periods under 30s | Protection trip or power supply |
| Link drops with no `PWSTANDBY` first | Lost power / tripped — it didn't choose to shut down |
| Repeated refused connections on port 23 | Another controller holds the single control session |

Two details that make the log more informative than it looks. A clean shutdown
is *announced* — the receiver sends `PWSTANDBY` before it goes. A protection
trip or a power cut just drops the socket with nothing beforehand, so the
presence or absence of that announcement separates "decided to" from "was
made to." And with Network Standby off, the network stack dies with the unit,
so the disconnect timestamp *is* the real power-off moment.

## Causes, most to least likely

**1. HDMI-CEC** (Denon calls it *HDMI Control*; the related one is *Power Off
Control*). A TV, Apple TV, PS5, or Chromecast asserts itself over CEC, the
receiver wakes and switches input, the TV responds, and it loops. Menu paths
move between model years, but look under Video → HDMI Setup. Turning HDMI
Control off is the test; the real fix is usually disabling CEC on the one
source device causing it, since CEC is worth keeping otherwise.

**2. Auto Standby / Eco / sleep timer.** Not a fault — the unit is doing what
it was told. Regular ~15/30/60 min ON periods give it away.

**3. Something on the network sending commands.** HEOS app, Home Assistant,
Alexa or Google, a Harmony hub, Roon, or a stale integration pointed at an IP
the receiver no longer holds. Nothing authenticates on port 23: anything that
can route to the receiver can power it. `sniff` names the IP.

**4. Protection mode.** Shorted speaker strand, impedance mismatch, blocked
ventilation. Very short ON times, front panel usually flashing. Test with all
speaker wires pulled — if it stays up bare, it's the wiring.

**5. Power delivery.** A smart plug on a schedule, a failing outlet, a tired
power strip switch. Unannounced drops with no `PWSTANDBY`.

**6. IR interference.** Sunlight, plasma displays, or some LED strips hitting
the IR window. Rare, but free to rule out by covering the window.

## UniFi-specific checks

A switch or AP cannot power-cycle an AVR. Your network is only implicated if
something on it is *sending commands* — or if UniFi controls the receiver's
power. So:

- **Is it on a UniFi smart outlet** (USP-Plug, USP-PDU-Pro)? Check that
  outlet's schedule and state. A schedule or a flapping relay hard-cycles the
  receiver, and this presents as unannounced drops with no `PWSTANDBY`.
- **Give it a fixed DHCP reservation.** If its IP moves, automations retry
  against the old address — and if another client inherits that IP, commands
  land on the wrong device. Cheap to do, removes a whole class of weirdness.
- **Find it in the client list** (it typically shows as Denon or D&M Holdings)
  and check its uptime graph. Repeated short sessions mean it's dropping off
  the network, which tells you Network Standby is off and it is genuinely
  losing power.
- **Cross-VLAN control** needs mDNS reflection on for discovery. This causes
  flaky *control*, not power cycling — but it makes apps retry aggressively,
  which is worth ruling out as noise while reading the log.
- For real per-flow visibility, run `sniff` from a host on the receiver's VLAN.
  UniFi's per-client stats won't show you client-to-client traffic without
  port mirroring.

## Recording what we find

Append findings below and commit them. This is the only thing that carries to
the next session.

### Log

- **2026-07-26** — Tooling written. No diagnosis yet: no data captured, and no
  access to the network from this environment. Receiver model, IP, and topology
  still unknown. Next step is Test 1 and Test 2 above, then a `monitor` capture.
