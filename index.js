const path = require('path');
const fs = require('fs');

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
      tasks.push(readWriteFile(originalFilePath, realFilePath));
    }
  });

  Promise.all(tasks)
    .then(() => {
      console.log('Concluído sem erros.');
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

function readWriteFile(readPath, writePath) {
  return new Promise((resolve, reject) => {
    fs.access(writePath, fs.constants.F_OK, (err) => {
      if (!err) {
        resolve(); // O arquivo já existe, então não é necessário ler e escrever novamente
        return;
      }

      createDirectory(path.dirname(writePath));

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
  });
}
