import { createClient } from 'webdav';

function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

export default class WebDAVProvider {
  constructor({ webDavURL, webDavUsername, webDavPassword }) {
    this.client = createClient(webDavURL, {
      username: webDavUsername,
      password: webDavPassword,
    });
  }

  readFile(path) {
    return this.client.getFileContents(path, { format: 'text' });
  }

  async writeFile(path, blob) {
    const buffer = await blobToArrayBuffer(blob);
    return this.client.putFileContents(path, buffer, { overwrite: true });
  }

  deleteFile(path) {
    return this.client.deleteFile(path).catch(() => {});
  }
}
