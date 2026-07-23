import { SYNC_README_NAME, SYNC_VERSION_BASENAME } from "./constants";

/**
 * GitHub Gist 连接测试（供 githubGist.jsx 调用）。
 * 有 gistId 时校验其可访问性并检测是否已有同步数据；
 * 无 gistId 时自动创建私密 Gist。
 * @returns {Promise<{status: 0|1, gistId: string}>} status=1 表示远端已有数据
 */
export async function testGithubGist(token, gistId) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  if (gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
    if (!res.ok) throw new Error(`验证 Gist 失败: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const hasData = data.files?.[SYNC_VERSION_BASENAME] ? 1 : 0;
    return { status: hasData, gistId };
  }

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: 'NewTab 数据备份',
      public: false,
      files: {
        [SYNC_README_NAME]: {
          content: 'NewTab 同步数据，请勿手动修改此 Gist 中的文件。',
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`创建 Gist 失败: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return { status: 0, gistId: data.id };
}
