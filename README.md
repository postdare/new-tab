# NewTab

Minimal browser new tab extension for Chrome / Firefox.

**Repo:** [postdare/new-tab](https://github.com/postdare/new-tab)

Based on [mumingfang/jvmaoTab](https://github.com/mumingfang/jvmaoTab) (MIT License).

## Features

- Minimal home screen: wallpaper + search
- Link drawer (groups, drag & drop, home shortcuts)
- Aggregated search / custom search engines
- Notes & time capsules
- Local-first storage; WebDAV / GitHub Gist sync
- Bing wallpaper, custom wallpaper, dark mode

## Usage

```bash
yarn && yarn build
```

### Dev

```bash
yarn && yarn d
```

### Firefox build

```bash
yarn && yarn build:firefox
```

#### Load temporarily in Firefox

1. Open `about:debugging`
2. Select **This Firefox**
3. **Load Temporary Add-on**
4. Choose `dist/manifest.json`

## License

MIT — see [LICENSE](./LICENSE).
