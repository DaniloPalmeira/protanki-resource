const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const rPath = path.join(process.env.APPDATA, 'StandaloneLoader', 'Local Store', 'cache');
const base64RegExp = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

fs.readdir(rPath, (err, files) => {
  if (err) {
    console.error(`Error reading directory: ${err}`);
    return;
  }

  const tasks = [];

  files.forEach((file) => {
    if (isBase64(file)) {
      const realFilePath = path.join('resources', Buffer.from(file, 'base64').toString('utf8').replace('http://146.59.110.103', '').split('?')[0]);
      const originalFilePath = path.join(rPath, file);
      tasks.push(compareAndUpdateFile(originalFilePath, realFilePath));
    }
  });

  Promise.all(tasks)
    .then(() => {
      console.log('Complete without errors.');
    })
    .catch((error) => {
      console.error(`Error executing tasks: ${error}`);
    });
});

function isBase64(str) {
  return base64RegExp.test(str);
}

function createDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    
    stream.on('end', () => {
      const md5 = hash.digest('hex');
      resolve(md5);
    });
    
    stream.on('error', (error) => {
      reject(`Error calculating MD5 hash: ${error}`);
    });
  });
}

function compareAndUpdateFile(originalFilePath, writePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const originalMD5 = await calculateMD5(originalFilePath);

      fs.access(writePath, fs.constants.F_OK, async (err) => {
        if (!err) {
          const writeMD5 = await calculateMD5(writePath);

          if (originalMD5 === writeMD5) {
            resolve();
          } else {
            await updateFile(originalFilePath, writePath);
            resolve();
          }

          return;
        }

        createDirectory(path.dirname(writePath));
        await updateFile(originalFilePath, writePath);
        resolve();
      });
    } catch (error) {
      reject(`Error comparing and updating file: ${error}`);
    }
  });
}

function updateFile(readPath, writePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(readPath, (err, data) => {
      if (err) {
        reject(`Error reading the file: ${err}`);
        return;
      }

      fs.writeFile(writePath, data, (err) => {
        if (err) {
          reject(`Error writing to the file: ${err}`);
          return;
        }

        resolve();
      });
    });
  });
}
