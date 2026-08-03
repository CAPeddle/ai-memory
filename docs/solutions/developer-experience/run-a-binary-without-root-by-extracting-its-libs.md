---
title: Run a downloaded binary without root by extracting its shared libraries
date: 2026-08-03
category: developer-experience
module: tooling
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - "A downloaded binary dies with 'error while loading shared libraries' on a headless Linux or WSL2 host"
  - "The documented fix is an apt install but there is no passwordless sudo"
  - "A tool must not become a project dependency, so it is installed outside the repo"
  - "Waiting on someone else's root access would block the work"
symptoms:
  - "error while loading shared libraries libnspr4.so cannot open shared object file"
  - "A vendor installer succeeds but the binary it fetched will not start"
  - "sudo prompts for a password in a non-interactive agent session"
root_cause: incomplete_setup
resolution_type: environment_setup
tags:
  - "shared-libraries"
  - "rootless"
  - "wsl2"
  - "headless-linux"
  - "dpkg"
  - "ld-library-path"
  - "playwright"
---

# Run a downloaded binary without root by extracting its shared libraries

## Context

Vendor installers routinely fetch a working binary and still leave it unable to start,
because the binary links against system libraries the image never had. On a headless
Ubuntu or WSL2 host this is the normal case, not the exception — desktop libraries are
absent precisely because there is no desktop.

The vendor's answer is almost always an `apt install` behind `sudo`. That is a dead end in
two common situations: an agent session with no interactive terminal to type a password
into, and a machine where you simply do not have root. Both look like hard blocks and are
not.

This came up installing a browser to verify a page by hand. `npx playwright install
chromium` downloaded fine, then:

```
error while loading shared libraries: libnspr4.so: cannot open shared object file
```

The documented fix, `sudo npx playwright install-deps chromium`, needed a password that was
not available. The work was unblocked in about two minutes without root.

## Guidance

### 1. Ask the binary what it is missing, rather than guessing

`ldd` names exactly the unmet links. This is the whole diagnosis, and it also tells you
whether the problem is small enough to be worth solving this way:

```bash
ldd /path/to/binary | grep "not found"
#   libnspr4.so => not found
#   libnss3.so => not found
#   libnssutil3.so => not found
```

Three missing objects from two packages is a two-minute fix. Thirty would be a signal to
find a container or ask for root instead.

### 2. Map the missing objects to packages

```bash
apt-file search libnspr4.so     # if apt-file is available
```

If it is not, the object name is usually the package name (`libnss3.so` → `libnss3`), and a
search engine settles the rest. Getting this slightly wrong is cheap — a wrong package
downloads and simply contains nothing useful.

### 3. Download and unpack the packages as an ordinary user

Neither step needs root. `apt-get download` fetches the `.deb` into the working directory
instead of installing it, and `dpkg-deb -x` extracts an archive to a path you choose:

```bash
mkdir -p ~/scratch/libs && cd ~/scratch/libs
apt-get download libnss3 libnspr4
for d in *.deb; do dpkg-deb -x "$d" root/; done
```

Do this **outside the repository**. A tool needed to check something is not a project
dependency, and a scratch directory keeps `git status` clean and the lockfile untouched.

### 4. Point the loader at the extracted tree

```bash
export LD_LIBRARY_PATH="$PWD/root/usr/lib/x86_64-linux-gnu"
ldd /path/to/binary | grep "not found" || echo "all links resolved"
```

`LD_LIBRARY_PATH` is per-process and per-shell. That is a feature: nothing about the
machine changed, so there is nothing to undo and no way to affect another project. Export
it in the same shell that launches the binary — a wrapper script or the command's own
environment block — and remember it does not survive into a new terminal.

### 5. Know when to stop

Prefer this when the missing set is small and the need is temporary. Reach for a container
image, or ask for root, when the list runs long, when the libraries must be present for
every future session, or when something needs them at boot rather than on demand. This
technique buys a fast unblock, not a managed dependency.

## Why This Matters

**"Needs sudo" is usually a statement about the convenient path, not the only one.** A
package manager does two separable things: it fetches an archive, and it writes into system
directories. Only the second needs privilege. Splitting them turns a blocked task into a
short one, and the split generalises well past this instance.

**It is genuinely reversible.** Nothing is installed. Deleting the scratch directory and
dropping the environment variable restores the machine exactly, which makes it a
low-consequence thing to try before escalating to someone with root.

**It keeps a verification tool out of the dependency graph.** The alternative that "feels"
tidier — adding the tool to the project so its install is managed — is worse: it puts a
thing you needed once into every future install, and in a repo with a deliberately frozen
lockfile that is a real cost.

## When to Apply

- A downloaded or vendor-installed binary fails with `error while loading shared libraries`.
- `ldd <binary> | grep "not found"` lists a handful of objects, not dozens.
- You need the tool now, once or a few times, and no root is available.
- **Not** when the tool is a genuine project dependency, or when many processes need the
  libraries — install them properly, or use an image that ships them.

## Examples

The full sequence that unblocked a headless WSL2 host with no desktop session and no
passwordless sudo:

```console
$ npx playwright install chromium      # downloads fine
$ node -e 'require("playwright").chromium.launch()'
error while loading shared libraries: libnspr4.so: cannot open shared object file

$ ldd ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"
        libnspr4.so => not found
        libnss3.so => not found
        libnssutil3.so => not found

$ mkdir -p /tmp/browser-libs && cd /tmp/browser-libs
$ apt-get download libnss3 libnspr4
Get:1 http://archive.ubuntu.com/ubuntu ... libnspr4 amd64 ... [118 kB]
Get:2 http://archive.ubuntu.com/ubuntu ... libnss3 amd64 ... [1515 kB]

$ for d in *.deb; do dpkg-deb -x "$d" root/; done
$ export LD_LIBRARY_PATH=$PWD/root/usr/lib/x86_64-linux-gnu

$ ldd <binary> | grep "not found" || echo "all links resolved"
all links resolved
```

Three missing objects, two packages, ~1.6 MB, no root, nothing installed.

## Related

- [docs/workflow-mvp.md](../../workflow-mvp.md), "Verifying the dashboard in a real browser"
  — the ST-086 procedure this was extracted from, where it is one step of a larger manual
  check. That doc describes disposable code; this technique is not disposable, which is why
  it lives here as well.
- [conventions/verification-mechanisms-need-adversarial-review.md](../conventions/verification-mechanisms-need-adversarial-review.md)
  — the wider point about what it takes to make a check actually runnable.
