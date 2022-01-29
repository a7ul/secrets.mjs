# 🕵️ Secrets.mjs

Manage your team's local environment secrets with gcloud securely.

This script is a single file pure nodejs script.

## Pre requisites

- Gcloud SDK: Make sure you have gcloud sdk/cli installed and authenticated.
- Google Cloud Storage Bucket: Access to a google cloud storage bucket where you want to store your team's secrets.

## Installation

You can use secrets.mjs by just copying it and commiting it in your repo.

1. Download the secrets.mjs script from the repo to your machine.

```
curl https://raw.githubusercontent.com/a7ul/secrets.mjs/main/secrets.mjs > secrets.mjs
```

2. Now edit the secrets.mjs file with your own variables.

```js
// gcp bucket where all shared secrets are stored. Change this to your own bucket name.
const GCS_BUCKET = "dev-secret-files-gcp-bucket";
// local secrets directory relative to this script where the secrets will be downloaded from the gcp bucket
const LOCAL_SECRETS_DIR = "./secrets";
```

3. Run the script

```sh
node ./secrets.mjs
```

or

```sh
chmod a+x ./secrets.mjs
./secrets.mjs
```

It is recommended you commit secrets.mjs with your repo, so its easier to run whenever you want to sync your team's shared secrets.

## Usage and features

**Download secrets from shared google cloud storage bucket**

```sh
 ./secrets.mjs download
```

**Upload secrets from local to shared google cloud storage bucket**

```sh
 ./secrets.mjs upload
```

**Diff your local secret files with the ones stored in shared google cloud storage bucket**

```sh
./secrets.mjs diff
```

## Requirements

- Node v14 and above

# License

MIT
