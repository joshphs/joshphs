# Denon power-cycling diagnosis

Tooling and a triage order for a Denon/Marantz AVR **at the Tahoe house** that
keeps turning itself on and off.

## Situation

The receiver is at the Tahoe house. Nobody is standing in front of it. That
single fact reorders everything below:

- The fast physical tests (pull HDMI, pull Ethernet) are still the highest-value
  moves, but they need a person on site. They're queued, not first.
- Whatever you're observing, you're observing it *through the network* — which
  means the observation itself needs checking before the receiver does.
- Tahoe-specific causes move up the list: grid events and PSPS de-energization,
  an unheated house, and other people (caretaker, cleaners, guests) coming and
  going without you knowing.

## First question: how do you know it's cycling?

Answer this before anything else, because two of the likeliest explanations are
artifacts of *remote observation*, not faults in the receiver.

If you're inferring it from the UniFi client list — the Denon appearing and
disappearing — then note that **with Network Standby off, the receiver drops off
the network every time it enters normal standby.** A perfectly healthy unit
being switched on and off by a person at the house produces exactly the flapping
you'd see remotely. Same for an Auto Standby timer doing its job.

So:

| What you're actually seeing | What it's worth |
|---|---|
| UniFi client connecting/disconnecting | Ambiguous — normal standby looks identical. Check Network Standby before believing it |
| UniFi smart-outlet power draw dropping to zero | Real. The unit is losing mains power |
| Someone at the house reporting it | Real, and worth asking them exactly what the front panel shows |
| HEOS app losing the receiver | Ambiguous — same standby caveat, plus mDNS flakiness |

## Read this first: what I can and can't see

I run in a throwaway cloud container, not on your LAN. This one was built at
02:36 and had no route off itself (`192.0.2.2`, a documentation-only range).
Your UniFi console genuinely does give *you* a remote view of the Tahoe site
from anywhere — that's what unifi.ui.com is for, and it's why "it's on my
Ubiquiti network" feels like it should be enough. But that's your account, your
vantage point. It doesn't hand this container a route or a credential.

I also can't read previous sessions. Each session gets a fresh container and
starts with no history. I checked for prior context before saying so:

- `~/.claude/projects/` — only this session's own transcript
- this git repo — one commit, `Initialize repository`, a single empty `.gitkeep`
- Notion, Google Drive, Dropbox, Gmail — searched for Denon/Marantz/HEOS, nothing

That's the gap worth closing, and it's why this file exists. Anything we work
out should get written down **here** and committed, because the repo is the only
thing that survives to the next session. Findings recorded in chat are gone when
the container is reclaimed.

## Remote path: what you can do from here

You need a route to the Tahoe LAN and something to run the monitor on. You
almost certainly already have both.

**Getting a route.** Your UDM/UXG can give you one — this is the part your
existing gear solves for free:

- **UniFi Teleport** — one-tap WireGuard from the UniFi app on a laptop or
  phone. Nothing to install at the house.
- **Site-to-site or a manual WireGuard/L2TP server** on the gateway if you'd
  rather have it always up.

Once you're on the tunnel you're logically on that LAN, and every command in
*The tool* below works from wherever you are.

**Somewhere to run it.** `monitor` needs to hold a socket open for hours or
days, so a laptop over a tunnel is fine for a first capture but not for a long
one. Better if the house already has an always-on box:

| Box | Notes |
|---|---|
| Synology / QNAP NAS | Python is there or one package away. Ideal — already on 24/7 |
| Raspberry Pi, Mac mini, old laptop | Ideal for the same reason |
| Home Assistant host | Ditto, and it may already be logging the receiver |
| UniFi Cloud Key / Dream Machine | Don't. Running arbitrary scripts on the gateway isn't worth it |
| Nothing at the house | A Pi shipped there is ~$40 and pays for itself if this drags on |

Start a capture with `nohup` or `tmux` so it survives your tunnel dropping:

```bash
nohup python3 denon_watch.py monitor --host <ip> --log denon.log &
```

**Before any of that**, check the two things UniFi will tell you in thirty
seconds — see *UniFi checks* below. If the receiver is on a USP-Plug, the power
draw graph answers the whole question without the tool.

## On-site path: bisect before you instrument

**Requires someone at the house.** Queue this for the next trip, or talk a
caretaker through it — it's two cable pulls and no software, and it kills most
of the possibility space in about twenty minutes.

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
subnet/VLAN as the receiver — including one you reach over Teleport or a
site-to-site tunnel.

`--host` is optional everywhere. Omit it and the receiver is discovered
automatically, so there's no IP to copy between commands:

```bash
python3 denon_watch.py info                     # model + the settings that matter
python3 denon_watch.py monitor --log denon.log  # leave running, reproduce the fault
python3 denon_watch.py analyze denon.log        # name the cause
sudo python3 denon_watch.py sniff               # who is commanding it
```

Pass `--host 192.168.1.50` explicitly if there's more than one receiver, or if
discovery can't see it (different VLAN, or Network Standby off while it sits in
standby).

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

Ordered for a house that's occupied. For Tahoe specifically, read **0** first —
an empty house in the mountains changes the base rates.

**0. It isn't cycling.** Covered above: with Network Standby off, normal standby
is indistinguishable from power loss when you're watching the client list. Rule
this out before spending money or a trip on it.

**0b. Grid.** Tahoe loses power — winter storms, wind, and PG&E PSPS
de-energization events. A receiver whose power setting is *Last* rather than
*Standby* will come back up on every restoration, and a brownout (more common
than a clean outage, and worse for electronics) can trip protection repeatedly.
Cross-check the timestamps against a PG&E outage map or against whether other
clients at the house dropped at the same moment — if the whole site went dark,
it's the grid and not the receiver. A UPS on the AV rack is the fix, and it
answers the question permanently.

**0c. Someone is there.** A caretaker, cleaner, guest, plumber, or renter using
the system looks exactly like spurious cycling from a remote client list. Worth
one text before it's worth a diagnosis.

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
  and check its uptime graph. Read this carefully: repeated short sessions mean
  it's dropping off the network, and that is *not* the same as losing power. If
  Network Standby is off, every ordinary standby produces the same graph. The
  graph tells you when the unit stopped being on the network; only the outlet's
  power draw, or a `monitor` log showing no `PWSTANDBY` before the drop, tells
  you whether it *chose* to.
- **Correlate against the rest of the site.** Pick two or three other always-on
  clients at the house and compare their disconnect timestamps to the
  receiver's. If everything dropped together, you're looking at a grid event or
  a gateway reboot, not an AVR fault. This is the single highest-value remote
  check after the smart outlet, and it costs one glance.
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
- **2026-07-26** — Receiver is at the **Tahoe house**; owner is remote. Guide
  reordered around that: on-site cable tests deferred until someone is there,
  remote path (Teleport → always-on host → `monitor`) promoted, and grid events
  plus other-people-at-the-house added as leading causes. Flagged that observing
  this through the UniFi client list is ambiguous by itself, since Network
  Standby off makes ordinary standby look like power loss.

- **2026-07-26** — **First actual symptom description, and it reorders everything
  above.** Not spontaneous cycling. The sequence is: turn the TV on → CEC wakes
  the receiver → both stay up "for a bit" → **both** shut off together. Retrying
  enough times eventually sticks and it stays on.

  Two facts do the work here. *Everything* turning off together means CEC is
  propagating a System Standby across the chain — a protection trip alone would
  not take the TV with it. And *retrying eventually works*, which is the
  signature of something marginal that sometimes succeeds, not of a schedule, a
  command, or a grid event.

  That leaves two candidates:

  1. **Marginal HDMI link.** HDCP/EDID handshake failing intermittently — aging
     or underspec cable, or a bandwidth-marginal 4K/HDR mode. Fails, CEC
     propagates standby, retry until one attempt trains successfully.
  2. **Failing power supply.** Works once warm; retrying heats it until it
     holds. Denon HDMI boards and supply capacitors are a known aging failure,
     and this one gets worse rather than better.

  A single `monitor` capture across one reproduction discriminates them:
  `PWSTANDBY` before the drop means it was *told* to shut down (CEC, receiver is
  healthy); an unannounced socket drop means it *lost power* (hardware).

  Ruled out by this description: grid events, PSPS, network commands, Auto
  Standby, and other people at the house. The remote-observation ambiguity is
  also moot — this is being watched directly, not through the client list.

- **2026-07-27** — **Settings menu photographed. Found the likely cause.**

  `Video/HDMI Setup` reads:

  | Setting | Value |
  |---|---|
  | HDMI Audio Out | AVR |
  | HDMI Pass Through | On |
  | – Pass Through Source | Last |
  | – RC Source Select | Power On + Source |
  | **HDMI Control** | **On** |
  | – ARC | On |
  | – TV Audio Switching | Off |
  | **Power Off Control** | **All** |
  | – Power Saving | Off |
  | – Smart Menu | Off |

  **`Power Off Control: All`** is the finding. The on-screen help states it
  plainly — it "activates standby with a command from all sources." Any device
  on the CEC bus can put the receiver into standby, not just the TV. A source
  asserting standby while waking or renegotiating its HDMI link takes the
  receiver down, and the TV follows once it loses its audio path.

  This also explains the intermittency, which never fit a hardware fault.
  Sources renegotiate HDMI during power-on; if one asserts standby mid-handshake
  the receiver obeys. When the timing happens to work out, nothing asserts
  standby and the system stays up — which is exactly "retry enough times and it
  eventually sticks."

  Front panel corroborates: displays `PowerOff Ctrl All`.

  Fix ladder, in order:

  1. **`Power Off Control` → `Off`.** Unlinks the receiver from other devices'
     standby commands. Test by cycling the TV several times.
  2. If it persists, **`HDMI Control` → `Off`** to disable CEC entirely. Loses
     TV-wakes-receiver until re-enabled, but it is decisive.
  3. **Still dies with CEC fully off** → not CEC. Back to the marginal HDMI link
     or the power supply, and the `monitor` capture becomes the next step.

  `HDMI Pass Through: On` keeps the unit on the CEC bus during standby, so it
  listens for standby commands continuously. Fine on its own; only a problem
  paired with `Power Off Control: All`. `RC Source Select: Power On + Source`
  can cause spurious wake-ups but never shutdowns, so it is not implicated.

## Pick up here

State as of the last session. Earlier open questions that are now answered are
recorded in the log above rather than repeated here.

**Current status: a fix is applied and awaiting confirmation.**
`Power Off Control` was found set to `All`, which lets any CEC device put the
receiver into standby. Changed to `Off`. **Whether that actually fixed it is the
open question** — cycle the TV several times and see.

If it persists, work down the ladder in the 2026-07-27 log entry: `HDMI Control`
→ `Off` to rule CEC out entirely, and if it still dies with CEC off, the cause is
physical and the capture below becomes the next step.

**The measurement, if it comes to that.** From a laptop on the house network,
with the system powered on:

```bash
python3 denon_watch.py monitor --log denon.log
```

Then reproduce it — TV off, TV on — and let it fail at least once. Then:

```bash
python3 denon_watch.py analyze denon.log
```

| What the capture shows | Verdict |
|---|---|
| `PWSTANDBY` immediately before the drop | It was **told** to shut down. CEC. Receiver is healthy, this is a settings fix |
| Socket drops with nothing beforehand | It **lost power**. Failing supply or protection trip. Hardware |

Nothing else in this file matters more than that one distinction, and it cannot
be obtained by watching the front panel.

**Still unknown:**

1. **Did `Power Off Control: Off` fix it?** The whole question right now.
2. **Which CEC device is asserting standby**, if the fix works but the
   convenience of TV-wakes-receiver is wanted back. Re-enable linkage, then
   disable CEC on sources one at a time — it is usually one specific box.
3. **Receiver model** — `denon_watch.py info` prints it. Menu paths here are
   generic until we have it, though the photographed menu matches the standard
   AVR-X layout.
4. **Which device goes dark first**, TV or receiver. One free observation per
   failure, and it only matters if the CEC fixes fail.
5. **Whether the TV's HDMI cable has been swapped.** Sixty-second test, and the
   most common cause of an intermittent handshake if this turns out not to be
   CEC after all.
