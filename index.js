const http = require('http');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const simpleGit = require('simple-git');



const rPath = path.join(process.env.APPDATA, 'StandaloneLoader', 'Local Store', 'cache');
const base64RegExp = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const ipRegExp = /http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

async function downloadFile(downloadUrl) {
  const parsedUrl = new url.URL(downloadUrl);
  parsedUrl.searchParams.append('nocache', Date.now());

  return new Promise((resolve, reject) => {
    const request = http.get(parsedUrl.href, response => {
      let data = Buffer.alloc(0);
      response.on('data', chunk => data = Buffer.concat([data, chunk]));
      response.on('end', () => resolve(data));
    });
    request.on('error', reject);
  });
}

async function downloadAndCheckFiles(files) {
  for (const file of files) {
    const writePath = path.join('resources', 'swf', path.basename(new url.URL(file.url).pathname));
    await createDirectory(path.dirname(writePath));

    const data = await downloadFile(file.url);
    const downloadedMD5 = crypto.createHash('md5').update(data).digest('hex');

    let localMD5;
    try {
      localMD5 = await calculateMD5(writePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (downloadedMD5 !== localMD5) {
      await fsp.writeFile(writePath, data);
    }
  }
}

function isBase64(str) {
  return base64RegExp.test(str);
}

async function createDirectory(directory) {
  try {
    await fsp.mkdir(directory, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
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
      if (err.code !== 'ENOENT') throw err;
      await createDirectory(path.dirname(writePath));
    }

    await updateFile(originalFilePath, writePath);
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
      const git = simpleGit();
      const status = await git.status();
      
      if (!status.isClean()) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // JavaScript months are 0-indexed
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const message = `Update: ${year}/${month}/${day} ${hours}:${minutes}`;
        await git.add('./*');
        await git.commit(message);
        await git.push('origin', 'master');
      }
    } catch (err) {
      console.error(`Error during Git operations: ${err}`);
    }
}

async function main() {
  try {
    const files = await fsp.readdir(rPath);
    const tasks = files
      .filter(isBase64)
      .map(file => {
        const realFilePath = path.join('resources', Buffer.from(file, 'base64').toString('utf8').replace(ipRegExp, '').split('?')[0]);
        const originalFilePath = path.join(rPath, file);
        return compareAndUpdateFile(originalFilePath, realFilePath);
      });
    await Promise.all(tasks);

    const filesToDownload = [
      { url: 'http://146.59.110.103/Prelauncher.swf' },
      { url: 'http://146.59.110.103/Loader.swf' },
      { url: 'http://146.59.110.103/library.swf' }
    ];
    await downloadAndCheckFiles(filesToDownload);
    await commitAndPush();
    console.log('Complete without errors.');
  } catch (err) {
    console.error(`Error reading directory or executing tasks: ${err}`);
  }
}

main();
