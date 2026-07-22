import { browserApi } from "@/utils/browser";
import { handleSyncMessage } from "./sync";

const cloudOptions = ['soList', 'activeSo', 'translateList', 'activeTranslate', 'linkSpan', 'copyClose', 'pwKey', 'defaultOpenAdd', 'soStyleIsRound', 'soAOpen', 'defauiltLink', 'isSoBarDown', 'linkOpenSelf', 'customkey', 'systemTheme', 'showHomeClock', 'homeLinkMaxNum', 'rollingBack', 'soHdCenter', 'tabTitle', 'webDavURL', 'webDavUsername', 'webDavPassword', 'webDavDir', 'homeImgOpacity', 'syncType', 'githubToken', 'githubGistId', 'showHomeGroupTitle'];

const SYNC_MESSAGE_TYPES = new Set([
  'SYNC_ACQUIRE_LOCK',
  'SYNC_RELEASE_LOCK',
  'SYNC_TOUCH_LOCK',
  'SYNC_READ_FILE',
  'SYNC_WRITE_FILE',
  'SYNC_WRITE_FILES',
  'SYNC_DELETE_FILE',
]);

let optionsValue = {};
let saveOptionsValue = {};
let getOptionTime = 0;
let setOptionTime = 0;

// 防抖
const debounce = (fn, delay) => {
  let timer;

  return function (...args) {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn.apply(this, args);
    })

    return timer
  }
}

const setOption = (sendResponse, values) => {
  setOptionTime = Date.now();

  const data = {};
  for (const key in values) {
    if (Object.hasOwnProperty.call(values, key)) {
      if (cloudOptions.includes(key)) {
        data[key] = values[key];
      }
    }
  }
  saveOptionsValue = {
    ...saveOptionsValue,
    ...data
  };
  setTimeout(() => {
    if (setOptionTime > Date.now()) {
      return;
    }

    if (Object.keys(saveOptionsValue).length > 0) {
      const dataToSave = {
        ...saveOptionsValue
      };
      saveOptionsValue = {};
      browserApi?.storage?.sync?.set(dataToSave, function () {
        getOptionTime = 0;
      });
    }
  }, 1000);

  sendResponse('seccusss');

}

const _getOption = () => {
  return new Promise((resolve, reject) => {
    if (getOptionTime + 10 * 60 * 1000 > Date.now()) {
      resolve(optionsValue);
    } else {
      browserApi?.storage?.sync?.get(cloudOptions, function (result) {
        optionsValue = result;
        getOptionTime = Date.now();
        resolve(result);
      })
    }

  })
}

const getOption = (sendResponse, values) => {
  _getOption().then((res) => {
    sendResponse(res);
  })
}

browserApi?.runtime?.onMessage.addListener(function (request, sender, sendResponse) {
  if (SYNC_MESSAGE_TYPES.has(request?.type)) {
    handleSyncMessage(request, sender)
      .then((result) => {
        if (result == null) {
          sendResponse({ ok: false, error: `未知同步消息: ${request?.type}` });
          return;
        }
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[sync]', request?.type, error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }

  switch (request.type) {
    case "setOptions":
      setOption(sendResponse, request.data);
      break;
    case "getOption":
      getOption(sendResponse);
      break;
    case "PAGE_FAVICON_DETECTED":
      // 暂存到 chrome.storage.local，newtab 会定期检查并保存
      if (request.data && request.data.domain && request.data.iconUrl) {
        browserApi?.storage?.local?.get(['pendingFavicons'], (result) => {
          const pending = result.pendingFavicons || [];
          // 避免重复
          const exists = pending.find((p) => p.domain === request.data.domain);
          if (!exists) {
            pending.push({
              domain: request.data.domain,
              iconUrl: request.data.iconUrl,
              size: request.data.size || null,
              timestamp: Date.now(),
            });
            browserApi?.storage?.local?.set({ pendingFavicons: pending });
          }
        });
      }
      sendResponse({ ok: true });
      return true; // 异步响应
  }
  return true;
});

// 右键菜单：收藏网址
browserApi?.runtime?.onInstalled.addListener(function () {
  browserApi?.contextMenus?.create({
    id: "bookmarkPageMenu",
    title: "收藏网址到抽屉",
    contexts: ["page"],
  });

  browserApi?.contextMenus?.create({
    id: "bookmarkActionMenu",
    title: "收藏当前页面到抽屉",
    contexts: ["action"],
  });
});

browserApi?.contextMenus?.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === "bookmarkPageMenu" || info.menuItemId === "bookmarkActionMenu") {
    // 处理收藏网址到抽屉
    const savePendingLink = (url, title) => {
      // 先尝试发送消息到 newtab 页面
      browserApi?.runtime?.sendMessage({
        type: "ADD_PENDING_LINK",
        data: {
          url: url,
          title: title
        }
      }).catch(() => {
        // 如果 newtab 页面未打开，使用 chrome.storage.local 作为后备存储
        browserApi?.storage?.local?.get(['pendingLinks'], (result) => {
          const pendingLinks = result.pendingLinks || [];
          // 检查是否已存在相同的 URL
          const exists = pendingLinks.find((link) => link.url === url);
          if (!exists) {
            pendingLinks.push({
              url: url,
              title: title,
              timestamp: Date.now()
            });
            browserApi?.storage?.local?.set({ pendingLinks: pendingLinks });
          }
        });
      });
    };

    // 如果是扩展图标右键，需要获取当前活动标签页
    if (info.menuItemId === "bookmarkActionMenu") {
      browserApi?.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const currentTab = tabs[0];
          savePendingLink(currentTab.url, currentTab.title);
        }
      });
    } else {
      // 网页右键菜单，直接使用当前标签页信息
      savePendingLink(info.pageUrl || tab.url, tab.title);
    }
  }
});