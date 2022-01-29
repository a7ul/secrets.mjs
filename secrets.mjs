#!/usr/bin/env node

/**
 * The MIT License (MIT)
 * copyright © 2022 Atul R
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the “Software”), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
 * SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
 * OR OTHER DEALINGS IN THE SOFTWARE.
 **/

import readline from "readline";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const scriptPath = fileURLToPath(import.meta.url);
const scriptName = path.basename(scriptPath);

const LOCAL_SECRETS_DIR = "./secrets"; // local secrets directory relative to this script where the secrets will be downloaded from the gcp bucket
const GCS_BUCKET = "dev-secret-files-gcp-bucket"; // gcp bucket where all shared secrets are stored.
const TMP_DIFF_DIR = `/tmp/cloud`;

let enableDebugging = false;
const localSecretsDir = path.resolve(
  path.dirname(scriptPath),
  LOCAL_SECRETS_DIR
);

function createLogger() {
  return {
    debug: (...args) => {
      enableDebugging && console.debug(...args);
    },
    info: console.log,
  };
}
const log = createLogger();

function processArgs(args) {
  const options = {};
  const positional = [];

  for (const arg of args) {
    if (arg.startsWith("-") || arg.startsWith("--")) {
      const [key, ...values] = arg.split("=");
      const value = values.join("=");
      options[key] = value || "true";
    } else {
      positional.push(arg);
    }
  }

  return { options, positional };
}

async function ask(q = "Question?", choices = []) {
  let ques = q + " ";
  const allChoices = choices.map((c) => `- ${c}`).join("\n");
  if (allChoices) {
    ques = q + "\n" + allChoices + "\n> ";
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(ques, function (answer) {
      resolve(answer);
      rl.close();
    });
  });
}

function exec(command, silent = false) {
  log.debug(command);
  const child = spawn(command, {
    shell: true,
    windowsHide: true,
  });
  if (!silent || enableDebugging) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      const result = code === 0 ? resolve : reject;
      result({ code, stdout, stderr });
    });
  });
}

async function exit(code = 0) {
  await cleanup();
  process.exit(code);
}

function getBucketPath(fullFilePath) {
  const relativePath = path.relative(localSecretsDir, fullFilePath);
  if (relativePath.startsWith("..")) {
    throw new Error(
      `File path ${fullFilePath} must be inside the ${localSecretsDir}`
    );
  }
  return `gs://${path.join(GCS_BUCKET, relativePath)}`;
}

async function uploadAll() {
  await exec(`gsutil cp -r "${localSecretsDir}/*" "gs://${GCS_BUCKET}"`);
}

async function upload(localPath) {
  try {
    const bucketPath = getBucketPath(path.resolve(localPath));
    await exec(`gsutil cp "${localPath}" "${bucketPath}"`);
  } catch (e) {
    log.info(e.message);
    log.debug(e);
  }
}

async function download(localPath, targetPath = localPath, silent = false) {
  try {
    const bucketPath = getBucketPath(path.resolve(localPath));
    await exec(`gsutil cp "${bucketPath}" "${targetPath}"`, silent);
  } catch (e) {
    log.info(e.message);
    log.debug(e);
  }
}

async function downloadAll(targetPath = localSecretsDir, silent = false) {
  await exec(`gsutil cp -r "gs://${GCS_BUCKET}/*" "${targetPath}"`, silent);
}

async function diff(src, dest) {
  try {
    return await exec(`git --no-pager diff --color ${src} ${dest}`);
  } catch (e) {
    log.debug(e);
    return e;
  }
}

function randomName() {
  return crypto.randomBytes(5).toString("hex");
}

async function cleanup() {
  try {
    await exec(`rm -r ${TMP_DIFF_DIR}`, true);
  } catch (e) {}
}

async function downloadCommand(args, positional, options) {
  const selectedFiles = [...positional];
  if (selectedFiles.length === 0) {
    await downloadAll();
  } else {
    for (const file of selectedFiles) {
      await download(file);
    }
  }
}

async function diffProcessor(selectedFiles = []) {
  const tmpDir = path.resolve(TMP_DIFF_DIR, randomName());
  let hasDiff = false;
  log.info(`Preparing diffs...`);
  await exec(`mkdir -p ${tmpDir}`, true);
  if (selectedFiles.length === 0) {
    await downloadAll(tmpDir, true);
    const p = await diff(tmpDir, localSecretsDir);
    hasDiff = hasDiff || Boolean(p?.stdout || p?.stderr);
  } else {
    for (const file of selectedFiles) {
      const tmpPath = path.resolve(
        tmpDir,
        path.relative(localSecretsDir, file)
      );
      await download(file, tmpPath, true);
      const p = await diff(file, tmpPath);
      hasDiff = hasDiff || Boolean(p?.stdout || p?.stderr);
    }
  }
  if (!hasDiff) {
    log.info(`\nNo changes ✨\n`);
  }
}

async function diffCommand(args, positional, options) {
  const selectedFiles = positional;
  await diffProcessor(selectedFiles);
}

async function uploadCommand(args, positional, options) {
  const selectedFiles = [...positional];

  await diffProcessor(selectedFiles);

  const answer = await ask(
    `\nAre you sure you want to upload and update secrets for everyone?`,
    [`yes`, `no`]
  );

  if (!answer.toLowerCase().trim().startsWith("y")) {
    return;
  }

  if (selectedFiles.length === 0) {
    await uploadAll();
  } else {
    for (const file of selectedFiles) {
      await upload(file);
    }
  }
}

function helpCommand() {
  log.info(`
  🕵️  Secrets: Manage your team's local environment secrets with gcloud
  
  📖 Usage: ./${scriptName} <command> [options]
  
  Commands:
  ---------
  
  ⬆️  upload: ./${scriptName} upload [ <file1> <file2> ... ]
  
     Upload and update the secrets in the cloud storage.
     You will be shown a diff of the changes which you can review before the actual upload.
  
     <file>: optionally you can specify the selected files to upload.
    
  📥 download: ./${scriptName} download [ <file1> <file2> ... ]
  
     Download and update the secrets in your local dev environment from the cloud storage.
     
     <file>: optionally you can specify the selected files to download.
  
  👀 diff: ./${scriptName} diff [ <file1> <file2> ... ]
  
     Displays the diff between your local files and the files in the cloud storage.

     <file>: optionally you can specify the selected files to check the diff.
  
  💛 help: ./${scriptName} help
  
     Show this help text.
  
  Global options: 
    --debug: enable debugging
    -d: enable debugging
`);
}

function unknownCommand(command, args) {
  log.info(
    `\n  Error: ${
      command ? `Unknown command: ${command} 🤷` : `No command specified 😢`
    }`
  );
  helpCommand(args);
  throw new Error();
}

async function main() {
  try {
    const [command, ...args] = process.argv.slice(2);
    const { positional, options } = processArgs(args);

    if (options["-d"] || options["--debug"]) {
      enableDebugging = true;
    }

    switch (command) {
      case "download": {
        await exec(`mkdir -p ${localSecretsDir}`, true);
        await downloadCommand(args, positional, options);
        break;
      }
      case "upload":
        await uploadCommand(args, positional, options);
        break;
      case "diff":
        await diffCommand(args, positional, options);
        break;
      case "help":
        helpCommand();
        break;
      default:
        unknownCommand(command, args);
    }
    exit(0);
  } catch (e) {
    log.info(e.message);
    exit(-1);
  }
}

if (process.env.NODE_ENV !== "test") {
  await main();
}
