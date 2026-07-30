# Docker Import (M4)

Add environment records by pasting `docker ps` output from that environment's
host. Published **host** ports become records; you pick which ones to keep. Same
paste → preview → select shape as Jenkins **Browse jobs → Use**.

Reach it from the **container icon** in any environment card header (editor+). It
is not Jenkins-specific — any environment can import this way.

## Layers

| Layer      | File                                                             |
| ---------- | ---------------------------------------------------------------- |
| Routing    | `app/api/projects/[id]/environments/[envId]/docker-parse/route.ts` (POST, preview only) |
| UI         | `components/environments/docker-import-dialog.tsx`, trigger in `components/environments/environments-section.tsx` |
| Hook       | `hooks/docker/useDockerImport.ts` (`useParseDockerPs`)            |
| Service    | `services/docker/dockerPs.ts` (pure parser), `services/docker/dockerService.ts` (preview + match) |
| Repository | none of its own — imports reuse `environmentPortRepository` via `addPort` |

There is **one write path for records**: a chosen candidate is inserted through
the existing `POST …/ports` endpoint with `source: 'docker'`, exactly as the
browse-jobs dialog does for **Use**. The parse endpoint writes nothing.

## Why the parser is pattern-based, not column-based

The tempting approach is to read the header row's column offsets and slice each
line. **It doesn't work.** Real output:

```
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS                    PORTS                   NAMES
5f85288777ee   imaui…  "/dock…"  29 min…   Up 29 minutes (healthy)   0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp   imaui-web
```

The `PORTS` cell is 43 characters; the header's `PORTS` column is about 24. `NAMES`
therefore does not line up with its own header, and an offset-based parse
mis-reads exactly the rows that carry ports. Terminal wrapping and copy-paste make
it worse. `dockerPs.ts` matches patterns instead, so alignment is irrelevant.

What it extracts per line:

| Field | How |
| ----- | --- |
| Ports | `[host:]hostPort->containerPort/proto`. The **host** port becomes the record's port — that's the reachable one. |
| Container id | leading 12–64 hex token |
| Image | the token after the id |
| Name | last whitespace-delimited token |
| Status | `Up …` / `Exited …` / `Created …` / `Restarting …` / `Paused` / `Dead` |

Ignored as noise: shell prompt lines, the `docker ps` / `docker container ls`
command echo, the column header, and blanks.

`0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp` is **one** published port listed
twice (IPv4 + IPv6), so mappings dedupe by host port.

### Protocol inference

Docker only reports the transport. Container port `80` → `HTTP`, `443` → `HTTPS`,
`udp` → `UDP`, everything else → `HTTPS` (the default `extraction.ts` already
uses). Records don't currently expose a protocol control, so this is a best guess
by design.

## Nothing disappears quietly

Three buckets, all shown in the dialog:

- **Candidates** — importable, one per (container, host port).
- **Skipped** — containers understood but publishing no ports (a buildkit
  builder, an exited container). Listed under a disclosure so a container you
  expected to see is accounted for.
- **Unparsed** — lines that survived the noise filter and still yielded nothing,
  shown verbatim with a warning. Same rule as the Jenkins extraction: no silent
  truncation.

## Non-destructive by construction

A candidate whose **host port already exists** in the environment — whatever its
provenance, including a hand-typed `manual` row — is shown as **Tracked** and is
not inserted. So:

- re-pasting the same output adds nothing the second time;
- a name or domain someone edited by hand is never overwritten.

Candidates added during the current dialog session show as **Added**, so a row
can't be inserted twice before the project query refetches.

A container publishing several ports yields one candidate per port, named
`container:containerPort` to keep them distinguishable; a single-port container
just uses the container name.

## Limitations

- The **domain** is left blank — `docker ps` knows the port, not the hostname it's
  published under. Fill it in on the record.
- Import is a point-in-time snapshot, not a sync: a container later removed leaves
  its record behind.
- Only `docker ps` table output is understood. `--format` output, `docker
  compose ps`, and `podman ps` are untested.
