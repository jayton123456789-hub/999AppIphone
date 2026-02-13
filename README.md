# 999AppIphone

A concise developer README for consuming the **Juice WRLD API** documented in `JuiceWRLDAPIdocs.pdf`.

## API Base URL

```txt
https://juicewrldapi.com/juicewrld
```

## What this API provides

The API is centered around Juice WRLD catalog data and includes:

- Song catalog browsing with pagination/filter/search.
- Song detail lookup by ID.
- Aggregate stats by category and era.
- Metadata lists (categories and eras).
- Playable/audio-focused endpoints.
- File browsing and downloading.
- ZIP job creation for bulk file exports.
- Shareable playlist creation/retrieval.
- Random radio song discovery.

## Core endpoints

| Feature | Method | Endpoint |
|---|---|---|
| List songs | `GET` | `/songs/` |
| Song details | `GET` | `/songs/{id}/` |
| Global statistics | `GET` | `/stats/` |
| Categories | `GET` | `/categories/` |
| Eras | `GET` | `/eras/` |
| Random radio song | `GET` | `/radio/random/` |
| Browse files | `GET` | `/files/browse/` |
| File info | `GET` | `/files/info/` |
| Cover art | `GET` | `/files/cover/` |
| Download/stream file | `GET` | `/files/download/` |
| Create ZIP job | `POST` | `/files/zip/create/` |
| ZIP job status | `GET` | `/files/zip/status/{job_id}/` |
| ZIP job download | `GET` | `/files/zip/download/{job_id}/` |
| Create shared playlist | `POST` | `/shares/create/` |
| Get shared playlist | `GET` | `/shares/{token}/` |

## Songs API quick usage

### List songs

```bash
curl "https://juicewrldapi.com/juicewrld/songs/?page=1&page_size=20"
```

### Common query params

- `page` (optional)
- `page_size` (optional, default 20)
- `category` (`released`, `unreleased`, `unsurfaced`, `recording_session`)
- `era`
- `search` (name, credited artists, track titles; normalization aware)
- `searchall` (broader search incl. producers)
- `lyrics` (lyrics text search)
- `file_names_array=true|1|yes` (serialize file names as array)

### Example filtered search

```bash
curl "https://juicewrldapi.com/juicewrld/songs/?category=released&search=dont go&page=1&page_size=50"
```

### Song detail by ID

```bash
curl "https://juicewrldapi.com/juicewrld/songs/1/"
```

## File browsing and streaming

### Browse playable files

```bash
curl "https://juicewrldapi.com/juicewrld/files/browse/?path=Compilation&search=.mp3"
```

### Download/stream a file

```bash
curl "https://juicewrldapi.com/juicewrld/files/download/?path={file_path}" -o song.mp3
```

### Stream with HTTP range (seeking support)

```bash
curl -H "Range: bytes=0-1048575" \
  "https://juicewrldapi.com/juicewrld/files/download/?path={file_path}" \
  -o song_part.mp3
```

## Useful metadata endpoints

```bash
curl "https://juicewrldapi.com/juicewrld/stats/"
curl "https://juicewrldapi.com/juicewrld/categories/"
curl "https://juicewrldapi.com/juicewrld/eras/"
curl "https://juicewrldapi.com/juicewrld/radio/random/"
```

## Python example

```python
import requests

base = "https://juicewrldapi.com/juicewrld"
resp = requests.get(
    f"{base}/songs/",
    params={"category": "released", "search": "dont go", "page": 1}
)
resp.raise_for_status()
data = resp.json()
print("total:", data.get("count"))
for song in data.get("results", []):
    print(song.get("name"))
```

## Notes

- This README was assembled from the included API PDF (`JuiceWRLDAPIdocs.pdf`).
- If endpoints evolve, treat this as a quick reference and verify against your latest upstream API docs.
