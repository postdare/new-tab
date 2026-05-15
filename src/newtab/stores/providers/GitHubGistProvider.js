export default class GitHubGistProvider {
  constructor({ githubToken, githubGistId }) {
    this.token = githubToken?.trim() || '';
    this.gistId = githubGistId?.trim() || null;
  }

  _filename(path) {
    return path.split('/').pop();
  }

  _headers() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  async readFile(path) {
    if (!this.gistId) throw new Error('404 No Gist ID configured');
    const filename = this._filename(path);
    const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`${res.status} Failed to read gist`);
    const data = await res.json();
    const file = data.files?.[filename];
    if (!file) throw new Error('404 File not found in gist');
    if (file.truncated) {
      const rawRes = await fetch(file.raw_url, {
        headers: { Authorization: `token ${this.token}` },
      });
      return rawRes.text();
    }
    return file.content;
  }

  async writeFile(path, blob) {
    if (!this.gistId) throw new Error('未配置 Gist ID，请先完成 GitHub Gist 设置流程');
    const filename = this._filename(path);
    const content = blob instanceof Blob ? await blob.text() : String(blob);
    const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
      method: 'PATCH',
      headers: this._headers(),
      body: JSON.stringify({ files: { [filename]: { content } } }),
    });
    if (!res.ok) throw new Error(`写入 Gist 失败: ${res.status}`);
    return res.json();
  }

  deleteFile() {
    return Promise.resolve();
  }
}
