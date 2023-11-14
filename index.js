// Importações
const http = require("http");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const url = require("url");
const git = require("simple-git");
const { exec } = require("child_process");

// Constantes
const rPath = path.join(
  process.env.APPDATA,
  "StandaloneLoader",
  "Local Store",
  "cache"
);
const base64RegExp =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const ipRegExp = /http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

// Funções síncronas
function isBase64(str) {
  return base64RegExp.test(str);
}

// Funções assíncronas
async function createDirectory(directory) {
  try {
    await fsp.mkdir(directory, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function downloadFile(downloadUrl) {
  const parsedUrl = new url.URL(downloadUrl);
  parsedUrl.searchParams.append("nocache", Date.now());

  return new Promise((resolve, reject) => {
    const request = http.get(parsedUrl.href, (response) => {
      let data = Buffer.alloc(0);
      response.on("data", (chunk) => (data = Buffer.concat([data, chunk])));
      response.on("end", () => resolve(data));
    });
    request.on("error", reject);
  });
}

async function downloadAndCheckFiles(files) {
  for (const file of files) {
    const writePath = path.join(
      "resources",
      "swf",
      path.basename(new url.URL(file.url).pathname)
    );
    await createDirectory(path.dirname(writePath));

    const data = await downloadFile(file.url);
    const downloadedMD5 = crypto.createHash("md5").update(data).digest("hex");

    let localMD5;
    try {
      localMD5 = await calculateMD5(writePath);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    if (downloadedMD5 !== localMD5) {
      await fsp.writeFile(writePath, data);
    }
  }
}

function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function compareAndUpdateFile(originalFilePath, writePath) {
  try {
    const originalMD5 = await calculateMD5(originalFilePath);

    try {
      const writeMD5 = await calculateMD5(writePath);
      if (originalMD5 === writeMD5) {
        return;
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.log(writePath);
      if (!writePath.includes("pages.dev")) {
        await createDirectory(path.dirname(writePath));
      }
    }
    if (!writePath.includes("pages.dev")) {
      await updateFile(originalFilePath, writePath);
    }
  } catch (err) {
    throw new Error(`Error comparing and updating file: ${err}`);
  }
}

async function updateFile(readPath, writePath) {
  try {
    const data = await fsp.readFile(readPath);
    await fsp.writeFile(writePath, data);
  } catch (err) {
    throw new Error(`Error reading or writing the file: ${err}`);
  }
}

async function commitAndPush() {
  try {
    const message = `Update ${new Date().toISOString()}`;
    await git().add("./*");
    await git().commit(message);
    await git().push("origin");
  } catch (err) {
    console.error(`Error during Git operations: ${err}`);
  }
}

async function minimizeTerminalWindow() {
  return new Promise((resolve, reject) => {
    exec(
      'powershell -command "(New-Object -ComObject Shell.Application).MinimizeAll()"',
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error minimizing terminal window: ${error}`);
        } else {
          resolve();
        }
      }
    );
  });
}
async function main() {
  try {
    if (process.argv.includes("-git")) {
      await minimizeTerminalWindow();
    }
    const files = await fsp.readdir(rPath);
    const tasks = files.filter(isBase64).map((file) => {
      const realFilePath = path.join(
        "resources",
        Buffer.from(file, "base64")
          .toString("utf8")
          .replace(ipRegExp, "")
          .split("?")[0]
      );
      const originalFilePath = path.join(rPath, file);
      return compareAndUpdateFile(originalFilePath, realFilePath);
    });
    await Promise.all(tasks);

    const filesToDownload = [
      { url: "http://146.59.110.103/Prelauncher.swf" },
      { url: "http://146.59.110.103/Loader.swf" },
      { url: "http://146.59.110.103/library.swf" },
    ];
    await downloadAndCheckFiles(filesToDownload);

    // Verifique se o argumento -git foi passado na linha de comando
    if (process.argv.includes("-git")) {
      await commitAndPush();
    }

    console.log("Complete without errors.");
  } catch (err) {
    console.error(`Error reading directory or executing tasks: ${err}`);
  }
}

// Execução do código
main();
