#!/usr/bin/env python3
"""
denon_watch.py - diagnose a Denon/Marantz AVR that keeps powering on and off.

Denon/Marantz network receivers expose a line-based control protocol on TCP
port 23. The receiver pushes state changes to every connected client without
being asked, so holding that socket open gives you a timestamped log of every
power, zone, and input transition as it happens.

That log is what separates the causes. A CEC feedback loop, an auto-standby
timer, a rogue network controller, and a failing power supply all look the
same from the sofa but leave very different traces.

Stdlib only. Python 3.8+.

  python3 denon_watch.py discover
  python3 denon_watch.py info    --host 192.168.1.50
  python3 denon_watch.py monitor --host 192.168.1.50 --log denon.log
  python3 denon_watch.py analyze denon.log
  python3 denon_watch.py sniff   --host 192.168.1.50      # needs sudo
"""

import argparse
import os
import re
import socket
import statistics
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

CONTROL_PORT = 23
HTTP_PORTS = (8080, 80)

# Queries sent once at connect to capture the receiver's starting state.
# Denon's docs ask for a gap between commands; the receiver drops them if you
# blast the socket. 250ms is comfortable.
STARTUP_QUERIES = ["PW?", "ZM?", "SI?", "MV?", "MU?", "MS?", "SLP?", "STBY?", "ECO?", "NSFRN?"]
QUERY_GAP = 0.25

# Keepalive. Also proves the socket is still live rather than half-open.
KEEPALIVE_INTERVAL = 60
KEEPALIVE_CMD = "PW?"


# --------------------------------------------------------------------------
# logging
# --------------------------------------------------------------------------

def ts():
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


class EventLog:
    """Tab-separated event log: timestamp, kind, payload."""

    def __init__(self, path=None, echo=True):
        self.fh = open(path, "a", buffering=1) if path else None
        self.echo = echo

    def write(self, kind, payload=""):
        line = "{}\t{}\t{}".format(ts(), kind, payload)
        if self.fh:
            self.fh.write(line + "\n")
        if self.echo:
            print(line, flush=True)

    def close(self):
        if self.fh:
            self.fh.close()


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------

def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def ssdp_discover(timeout=4.0):
    """M-SEARCH the local segment. Denon/Marantz answer as UPnP MediaRenderers."""
    msg = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1900\r\n"
        'MAN: "ssdp:discover"\r\n'
        "MX: 3\r\n"
        "ST: ssdp:all\r\n\r\n"
    ).encode()

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.settimeout(1.0)

    found = {}
    deadline = time.time() + timeout
    try:
        s.sendto(msg, ("239.255.255.250", 1900))
        while time.time() < deadline:
            try:
                data, addr = s.recvfrom(65507)
            except socket.timeout:
                continue
            except OSError:
                break
            text = data.decode("utf-8", "replace")
            m = re.search(r"^LOCATION:\s*(\S+)", text, re.I | re.M)
            found.setdefault(addr[0], m.group(1) if m else "")
    finally:
        s.close()
    return found


def probe_port(ip, port, timeout=0.6):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        return s.connect_ex((ip, port)) == 0
    except OSError:
        return False
    finally:
        s.close()


def sweep_subnet(base, port=CONTROL_PORT, workers=64):
    """Probe x.y.z.1-254 for an open control port."""
    ips = ["{}.{}".format(base, i) for i in range(1, 255)]
    hits = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for ip, ok in zip(ips, pool.map(lambda i: probe_port(i, port), ips)):
            if ok:
                hits.append(ip)
    return hits


def http_get(url, timeout=3.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, ValueError):
        return None


def device_info(ip):
    """Pull the receiver's self-description over the goform HTTP endpoints."""
    info = {}
    for port in HTTP_PORTS:
        xml = http_get("http://{}:{}/goform/Deviceinfo.xml".format(ip, port))
        if not xml:
            continue
        try:
            root = ET.fromstring(xml)
        except ET.ParseError:
            continue
        for tag in ("ModelName", "BrandCode", "MacAddress", "DeviceZones"):
            el = root.find(".//" + tag)
            if el is not None and el.text:
                info[tag] = el.text.strip()
        info["_http_port"] = str(port)
        break

    for port in HTTP_PORTS:
        xml = http_get(
            "http://{}:{}/goform/formMainZone_MainZoneXmlStatusLite.xml".format(ip, port)
        )
        if not xml:
            continue
        try:
            root = ET.fromstring(xml)
        except ET.ParseError:
            continue
        for tag in ("Power", "InputFuncSelect", "MasterVolume", "Mute"):
            el = root.find(".//" + tag + "/value")
            if el is None:
                el = root.find(".//" + tag)
            if el is not None and el.text:
                info[tag] = el.text.strip()
        break
    return info


def find_receivers(timeout=4.0, verbose=False):
    """Return {ip: how_found} for hosts answering on the control port."""
    candidates = {}
    for ip, loc in ssdp_discover(timeout).items():
        candidates[ip] = "SSDP"

    mine = local_ip()
    if mine:
        base = ".".join(mine.split(".")[:3])
        if verbose:
            print("Sweeping {}.0/24 for open control port {}...".format(
                base, CONTROL_PORT))
        for ip in sweep_subnet(base):
            candidates.setdefault(ip, "port-scan")

    return candidates


def resolve_host(args):
    """The --host given, or the sole receiver on this subnet.

    Every command except discover needs an address. Making the flag optional
    removes the copy-the-IP-between-two-commands step, which matters when the
    person running this is standing at the receiver rather than at a desk.
    """
    if getattr(args, "host", None):
        return args.host

    sys.stderr.write("No --host given, searching...\n")
    found = {ip: how for ip, how in find_receivers().items()
             if probe_port(ip, CONTROL_PORT)}

    if not found:
        sys.stderr.write(
            "No receiver found. Pass --host explicitly, and note that a unit\n"
            "with Network Standby off is invisible here whenever it is in\n"
            "standby - which is itself worth knowing.\n")
        return None
    if len(found) > 1:
        sys.stderr.write("Found {}. Pass --host to pick one.\n".format(
            ", ".join(sorted(found))))
        return None

    ip = list(found)[0]
    sys.stderr.write("Using {}\n\n".format(ip))
    return ip


def cmd_discover(args):
    print("Looking for Denon/Marantz receivers...\n")

    candidates = find_receivers(args.timeout, verbose=True)

    if not candidates:
        print("\nNothing found. Check you're on the same VLAN/subnet as the receiver,")
        print("and that Network Standby is enabled (otherwise it drops off the network")
        print("the moment it goes into standby - which is itself a useful datapoint).")
        return 1

    print()
    hits = 0
    for ip, how in sorted(candidates.items()):
        if not probe_port(ip, CONTROL_PORT):
            continue
        info = device_info(ip)
        model = info.get("ModelName", "")
        brand = info.get("BrandCode", "")
        label = " ".join(x for x in (brand, model) if x) or "control port open, model unknown"
        print("  {:<16} {:<40} (via {})".format(ip, label, how))
        hits += 1

    if not hits:
        print("  No host had port {} open. Candidates seen: {}".format(
            CONTROL_PORT, ", ".join(sorted(candidates))))
        return 1

    print("\nNext:  python3 denon_watch.py monitor --host <ip> --log denon.log")
    return 0


def cmd_info(args):
    ip = resolve_host(args)
    if ip is None:
        return 1
    print("Receiver: {}\n".format(ip))

    info = device_info(ip)
    if info:
        for k, v in info.items():
            if not k.startswith("_"):
                print("  {:<18} {}".format(k, v))
    else:
        print("  (HTTP status endpoints unavailable - older model or HTTP control off)")

    print("\nControl port {}: {}".format(
        CONTROL_PORT, "open" if probe_port(ip, CONTROL_PORT) else "CLOSED/refused"))

    print("\nQuerying settings relevant to spurious power cycling...\n")
    try:
        conn = Control(ip)
        conn.connect()
    except OSError as e:
        print("  Could not open control port: {}".format(e))
        print("  If this is 'connection refused' while the receiver is on, something")
        print("  else already holds the single control session - see README.")
        return 1

    replies = conn.query_all(["PW?", "ZM?", "SI?", "SLP?", "STBY?", "ECO?"], settle=2.5)
    conn.close()

    if not replies:
        print("  No response. Some models only answer once fully powered on.")
    for r in replies:
        print("  {}".format(r))

    print("\n  STBY* = auto standby timer   ECO* = eco mode   SLP* = sleep timer")
    print("  A non-zero STBY value is a prime suspect if your off-times are regular.")
    return 0


# --------------------------------------------------------------------------
# control connection
# --------------------------------------------------------------------------

class Control:
    """Line protocol on port 23. Commands and replies are CR-terminated."""

    def __init__(self, host, port=CONTROL_PORT, timeout=5.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.sock = None
        self._buf = b""

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock.settimeout(1.0)
        self._buf = b""

    def send(self, cmd):
        self.sock.sendall((cmd + "\r").encode("ascii"))

    def read_lines(self):
        """Non-blocking-ish read. Returns complete lines, [] on timeout."""
        try:
            chunk = self.sock.recv(4096)
        except socket.timeout:
            return []
        if not chunk:
            raise ConnectionError("receiver closed the connection")
        self._buf += chunk
        out = []
        while True:
            idx = min((i for i in (self._buf.find(b"\r"), self._buf.find(b"\n")) if i >= 0),
                      default=-1)
            if idx < 0:
                break
            line = self._buf[:idx].decode("ascii", "replace").strip()
            self._buf = self._buf[idx + 1:]
            if line:
                out.append(line)
        return out

    def query_all(self, cmds, settle=2.0):
        replies = []
        for c in cmds:
            self.send(c)
            time.sleep(QUERY_GAP)
            replies.extend(self.read_lines())
        deadline = time.time() + settle
        while time.time() < deadline:
            replies.extend(self.read_lines())
        return replies

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None


# --------------------------------------------------------------------------
# monitor
# --------------------------------------------------------------------------

def cmd_monitor(args):
    host = resolve_host(args)
    if host is None:
        return 1

    log = EventLog(args.log, echo=True)
    log.write("SESSION", "monitor start host={} pid={}".format(host, os.getpid()))

    if args.log:
        print("# logging to {} - leave this running until it misbehaves a few times".format(
            args.log), file=sys.stderr)
        print("# then: python3 denon_watch.py analyze {}".format(args.log), file=sys.stderr)

    end = time.time() + args.duration * 60 if args.duration else None
    backoff = 2.0

    try:
        while True:
            if end and time.time() > end:
                log.write("SESSION", "duration reached, stopping")
                break

            conn = Control(host)
            try:
                conn.connect()
            except OSError as e:
                # A refused connection while the unit is ON means the single
                # control session is taken - by the HEOS app, Home Assistant,
                # a Harmony hub, something. That is itself a finding.
                log.write("LINK", "connect failed: {}".format(e))
                time.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
                continue

            log.write("LINK", "connected")
            backoff = 2.0

            for q in STARTUP_QUERIES:
                try:
                    conn.send(q)
                except OSError:
                    break
                time.sleep(QUERY_GAP)
                for line in conn.read_lines():
                    log.write("STATE", line)

            last_ka = time.time()
            try:
                while True:
                    if end and time.time() > end:
                        break
                    for line in conn.read_lines():
                        log.write("EVENT", line)
                    if time.time() - last_ka > KEEPALIVE_INTERVAL:
                        conn.send(KEEPALIVE_CMD)
                        last_ka = time.time()
            except (ConnectionError, OSError) as e:
                # The receiver dropping the socket is meaningful: with Network
                # Standby off, its network stack dies with the unit, so the
                # drop timestamp is the real power-off moment.
                log.write("LINK", "disconnected: {}".format(e))
            finally:
                conn.close()

            time.sleep(backoff)
    except KeyboardInterrupt:
        log.write("SESSION", "interrupted by user")
    finally:
        log.close()
    return 0


# --------------------------------------------------------------------------
# analyze
# --------------------------------------------------------------------------

POWER_ON = re.compile(r"^(PWON|ZMON)$")
POWER_OFF = re.compile(r"^(PWSTANDBY|ZMOFF)$")
SOURCE = re.compile(r"^SI(.+)$")


def parse_log(path):
    events = []
    with open(path) as fh:
        for raw in fh:
            parts = raw.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            try:
                when = datetime.fromisoformat(parts[0])
            except ValueError:
                continue
            events.append((when, parts[1], parts[2] if len(parts) > 2 else ""))
    return events


def describe_interval(seconds):
    if seconds < 90:
        return "{:.0f}s".format(seconds)
    if seconds < 5400:
        return "{:.1f}min".format(seconds / 60)
    return "{:.1f}h".format(seconds / 3600)


def cmd_analyze(args):
    events = parse_log(args.logfile)
    if not events:
        print("No parseable events in {}".format(args.logfile))
        return 1

    span = (events[-1][0] - events[0][0]).total_seconds()
    print("=" * 68)
    print("Denon power-cycle analysis: {}".format(args.logfile))
    print("=" * 68)
    print("Window   : {}  ->  {}".format(
        events[0][0].isoformat(timespec="seconds"),
        events[-1][0].isoformat(timespec="seconds")))
    print("Duration : {}".format(describe_interval(span)))
    print("Events   : {}".format(len(events)))

    transitions = []   # (time, "on"/"off")
    sources = []       # (time, source token)
    drops = []         # (time, detail)

    for when, kind, payload in events:
        if kind in ("EVENT", "STATE"):
            if POWER_ON.match(payload):
                transitions.append((when, "on"))
            elif POWER_OFF.match(payload):
                transitions.append((when, "off"))
            else:
                m = SOURCE.match(payload)
                if m:
                    sources.append((when, m.group(1)))
        elif kind == "LINK" and payload.startswith("disconnected"):
            drops.append((when, payload))

    # Collapse repeats - the receiver often echoes the same state twice.
    collapsed = []
    for t, state in transitions:
        if not collapsed or collapsed[-1][1] != state:
            collapsed.append((t, state))

    ons = [t for t, s in collapsed if s == "on"]
    offs = [t for t, s in collapsed if s == "off"]
    print("Power on : {}   Power off: {}   Link drops: {}".format(
        len(ons), len(offs), len(drops)))

    if len(collapsed) < 2:
        print("\nNot enough power transitions captured yet. Keep the monitor running")
        print("until the receiver has misbehaved at least three or four times.")
        return 0

    # --- on-time / off-time distributions -------------------------------
    on_durations, off_durations = [], []
    for (t1, s1), (t2, _s2) in zip(collapsed, collapsed[1:]):
        gap = (t2 - t1).total_seconds()
        (on_durations if s1 == "on" else off_durations).append(gap)

    print("\n--- Timing --------------------------------------------------------")
    for label, series in (("Stayed ON for", on_durations), ("Stayed OFF for", off_durations)):
        if not series:
            continue
        med = statistics.median(series)
        spread = statistics.pstdev(series) if len(series) > 1 else 0.0
        print("{:<15} n={:<3} median={:<9} min={:<9} max={:<9} stdev={}".format(
            label, len(series), describe_interval(med),
            describe_interval(min(series)), describe_interval(max(series)),
            describe_interval(spread)))

    findings = []

    # --- signature: auto-standby timer ----------------------------------
    # Auto Standby fires at a fixed 15/30/60min of inactivity, so ON periods
    # cluster tightly around one of those values.
    if len(on_durations) >= 3:
        med = statistics.median(on_durations)
        spread = statistics.pstdev(on_durations)
        for target, mins in ((15 * 60, 15), (30 * 60, 30), (60 * 60, 60)):
            if abs(med - target) < target * 0.15 and spread < target * 0.25:
                findings.append((
                    "AUTO-STANDBY TIMER",
                    "ON periods cluster at ~{}min (median {}, low spread). That is the "
                    "Auto Standby timer firing on inactivity, not a fault.".format(
                        mins, describe_interval(med)),
                    "Settings > General > Auto Standby > Off. Also check Eco Mode and "
                    "the sleep timer (SLP)."))
                break

    # --- signature: CEC feedback loop -----------------------------------
    # HDMI-CEC power events arrive bundled with an input change, because the
    # source device asserts itself as it wakes the chain.
    near_source = 0
    for t, _s in collapsed:
        for st, _tok in sources:
            if abs((st - t).total_seconds()) <= 5:
                near_source += 1
                break
    if collapsed and near_source / len(collapsed) >= 0.5:
        toks = {}
        for t, _s in collapsed:
            for st, tok in sources:
                if abs((st - t).total_seconds()) <= 5:
                    toks[tok] = toks.get(tok, 0) + 1
                    break
        worst = sorted(toks.items(), key=lambda kv: -kv[1])
        findings.append((
            "HDMI-CEC (HDMI Control)",
            "{} of {} power transitions came within 5s of an input change - "
            "sources: {}. A device on that input is driving the receiver over CEC.".format(
                near_source, len(collapsed),
                ", ".join("{} x{}".format(k, v) for k, v in worst[:4])),
            "Settings > Video > HDMI Setup > HDMI Control > Off (and Power Off Control "
            "> Off). If that stops it, re-enable and disable CEC on the source device "
            "instead - it is usually one specific box."))

    # --- signature: tight cycling / protection --------------------------
    tight = [g for g in on_durations if g < 30]
    if len(tight) >= 2:
        findings.append((
            "RAPID CYCLING - protection or power supply",
            "{} instances of the unit staying on under 30s (shortest {}). "
            "Software rarely cycles this fast.".format(
                len(tight), describe_interval(min(tight))),
            "Pull every speaker wire and power it on with no speakers attached. If it "
            "stays up, you have a shorted strand or an impedance problem. If it still "
            "cycles bare, it is the amp or PSU - that is a service call."))

    # --- signature: off without a preceding command ---------------------
    # A clean standby is commanded and announced. A protection trip or a power
    # blink just drops the link with no PWSTANDBY ahead of it.
    unannounced = 0
    for dt, _d in drops:
        announced = any(0 <= (dt - t).total_seconds() <= 10
                        for t, s in collapsed if s == "off")
        if not announced:
            unannounced += 1
    if unannounced >= 2:
        findings.append((
            "UNANNOUNCED DROPS",
            "{} link drops with no PWSTANDBY beforehand. The receiver did not "
            "choose to shut down - it lost power or tripped protection.".format(unannounced),
            "Check it is on a wall outlet, not a switched/smart plug or a strip with a "
            "failing switch. Then check ventilation and speaker wiring for shorts."))

    # --- signature: contended control session ---------------------------
    refused = sum(1 for _w, k, p in events if k == "LINK" and "connect failed" in p)
    if refused >= 3:
        findings.append((
            "CONTROL SESSION CONTENDED",
            "{} refused connections on port {}. Most models allow only one control "
            "session, so something else on your network is holding it open.".format(
                refused, CONTROL_PORT),
            "Run the 'sniff' subcommand to identify the other client by IP - typically "
            "Home Assistant, a Harmony hub, HEOS, or an old automation integration."))

    print("\n--- Findings ------------------------------------------------------")
    if not findings:
        print("No single signature dominates. Capture a longer window, and note the")
        print("wall-clock time of a cycle you witness so it can be matched to the log.")
    for i, item in enumerate(findings, 1):
        title, detail, fix = item[0], item[1], item[2]
        print("\n{}. {}".format(i, title))
        print("   {}".format(detail))
        print("   -> {}".format(fix))

    print("\n--- Transition log ------------------------------------------------")
    for t, s in collapsed[-24:]:
        near = [tok for st, tok in sources if abs((st - t).total_seconds()) <= 5]
        print("  {}  {:<4} {}".format(
            t.isoformat(timespec="seconds"), s.upper(),
            "(input: {})".format(", ".join(near)) if near else ""))
    return 0


# --------------------------------------------------------------------------
# sniff
# --------------------------------------------------------------------------

def cmd_sniff(args):
    """Identify which hosts are sending control traffic to the receiver."""
    host = resolve_host(args)
    if host is None:
        return 1

    ports = "23 or port 8080 or port 80 or port 60006"
    expr = "host {} and (port {})".format(host, ports)
    cmd = ["tcpdump", "-l", "-n", "-q", expr]
    if args.iface:
        cmd[1:1] = ["-i", args.iface]

    print("Watching who talks to {}.".format(host))
    print("Anything appearing here other than this machine is a controller that")
    print("can power-cycle your receiver.\n")
    print("$ {}\n".format(" ".join(cmd)))

    if os.geteuid() != 0:
        print("Needs root. Re-run with sudo, or just run the command above yourself.")
        return 1

    talkers = {}
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1)
    except FileNotFoundError:
        print("tcpdump not installed.")
        return 1

    try:
        for line in proc.stdout:
            m = re.search(r"IP (\d+\.\d+\.\d+\.\d+)\.\d+ > (\d+\.\d+\.\d+\.\d+)\.(\d+)", line)
            if not m:
                continue
            src, dst, dport = m.groups()
            if dst == host:
                key = (src, dport)
                talkers[key] = talkers.get(key, 0) + 1
                if talkers[key] in (1, 10, 100, 1000):
                    print("  {}  {} -> port {}  ({} packets)".format(
                        ts(), src, dport, talkers[key]))
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()

    print("\n--- Clients seen --------------------------------------------------")
    for (src, dport), n in sorted(talkers.items(), key=lambda kv: -kv[1]):
        print("  {:<16} port {:<6} {} packets".format(src, dport, n))
    return 0


# --------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(
        description="Diagnose a Denon/Marantz AVR that keeps powering on and off.")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="find receivers on this network")
    d.add_argument("--timeout", type=float, default=4.0)
    d.set_defaults(func=cmd_discover)

    i = sub.add_parser("info", help="dump model info and power-related settings")
    i.add_argument("--host", default=None, help="auto-discovered if omitted")
    i.set_defaults(func=cmd_info)

    m = sub.add_parser("monitor", help="log every state change with timestamps")
    m.add_argument("--host", default=None, help="auto-discovered if omitted")
    m.add_argument("--log", default=None, help="append events to this file")
    m.add_argument("--duration", type=float, default=0,
                   help="stop after N minutes (0 = run until Ctrl-C)")
    m.set_defaults(func=cmd_monitor)

    a = sub.add_parser("analyze", help="read a monitor log and name the cause")
    a.add_argument("logfile")
    a.set_defaults(func=cmd_analyze)

    s = sub.add_parser("sniff", help="find which hosts send commands to the receiver")
    s.add_argument("--host", default=None, help="auto-discovered if omitted")
    s.add_argument("--iface", default=None)
    s.set_defaults(func=cmd_sniff)

    args = p.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
