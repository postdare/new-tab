import {
  observable,
  action,
  computed,
  makeObservable,
  autorun
} from "mobx";
import {
  db
} from "~/db";
import BaseStore from "./BaseStore";
import { handleError } from "~/utils/errorHandler";
import {
  getID,
  diff
} from "~/utils";
import { ensureFaviconForUrl } from "~/utils/favicon";
import _ from "lodash";
import {
  PENDING_LINK_PARENT_ID,
  dedupePendingLinks,
  normalizePendingLinkUrl,
} from "./pendingLinks.mjs";

export default class LinkStore extends BaseStore {
  isInit = false;
  list = [];
  cacheList = [];
  linkNav = [];
  _solist = [];
  activeId = null;
  addPanelToLinkItemEmitter = null;
  constructor(rootStore) {
    super(rootStore);
    makeObservable(this, {
      isInit: observable,
      list: observable,
      cacheList: observable,
      linkNav: observable,
      activeId: observable,
      addPanelToLinkItemEmitter: observable,
      setActiveId: action,
      setLink: action,
      setCache: action,
      updateNav: action,
      getLinkByTimeKey: action,
      getActiveID: computed,
      titleLink: computed,
    });
    // autorun(() => {
    //   console.log("[ autorun. ] >", this.list);
    // });
  }

  async updateNav() {
    const homeId = await this.rootStore.option.getHomeId();
    const res = await this.getLinkByParentId([homeId], this.rootStore.option.showHide);
    this.linkNav = res.sort((a, b) => a.sort - b.sort);
    return this.linkNav;
  }

  async getNav(refresh = false) {
    const res = await this.updateNav();
    if (res.length === 0) {
      return;
    }
    if (refresh && this.activeId) {
      this.setActiveId(this.activeId, true);
    } else {
      this.setActiveId(res[0].timeKey);
    }
  }

  setActiveId(id, refresh = false) {
    if (refresh || this.activeId !== id) {
      this.activeId = id;
      const newList = [];
      this.getLinkByParentId([id]).then((res) => {
        newList.push(...res);
        this.getLinkByParentId(res.map((v) => v.timeKey)).then((res) => {
          newList.push(...res);
          this.setLink(newList);
        }).finally(() => {
          this.isInit = true;
        })
      });
    }
  }

  get getActiveID() {
    return this.activeId;
  }

  get titleLink() {
    if (this.list.length !== 0) {
      return this.linkForId(this.getActiveID);
    }
    return [];
  }

  linkForId(id) {
    return this.list
      .filter((v) => v.parentId === id)
      .sort((a, b) => {
        return a.sort - b.sort;
      });
  }

  setCache() {
    this.cacheList = _.cloneDeep(this.list);
  }

  setLink(link) {
    this.list = link;
    setTimeout(() => {
      this.setCache();
    }, 0);
  }

  async addLink(link) {
    const field = ["title", "url", "parentId", "sort", "timeKey", "hide"];
    try {
      const res = Array.isArray(link)
        ? await db.link.bulkPut(link.map((v) => _.pick(v, field)))
        : await db.link.put(_.pick(link, field));
      this.rootStore.data.update();
      return res;
    } catch (err) {
      handleError(err, "LinkStore.addLink");
      throw err;
    }
  }

  updateLink(links) {
    const field = ["title", "url", "parentId", "sort"];
    const update = links.map((v) => {
      if (!v.linkId) {
        // 如果没有 linkId，先查询获取
        return db.link
          .where("timeKey")
          .equals(v.timeKey)
          .first()
          .then((linkData) => {
            if (linkData && linkData.linkId) {
              return db.link.update(linkData.linkId, _.pick(v, field));
            } else {
              console.warn("updateLink: link not found for timeKey", v.timeKey);
              return Promise.resolve();
            }
          })
          .catch((err) => {
            handleError(err, "LinkStore.updateLink.fetchLinkId");
            return Promise.resolve();
          });
      } else {
        return db.link.update(v.linkId, _.pick(v, field));
      }
    });
    return Promise.all(update)
      .then((res) => {
        this.rootStore.data.update();
        return res;
      })
      .catch((err) => {
        handleError(err, "LinkStore.updateLink");
      });
  }

  async deleteLinkByTimeKey(timeKeys) {
    try {
      const res = await db.link.where("timeKey").anyOf(timeKeys).delete();
      this.rootStore.data.update();
      return res;
    } catch (err) {
      handleError(err, "LinkStore.deleteLinkByTimeKey");
      throw err;
    }
  }

  getLinkByParentId(parentIds, hide = false) {
    return this.safeDbOperation(() => {
      if (hide) {
        return db.link.where("parentId").anyOf(parentIds).toArray();
      }
      return db.link
        .where("parentId")
        .anyOf(parentIds)
        .and(function (link) {
          return !link.hide;
        })
        .toArray();
    }, "LinkStore.getLinkByParentId");
  }

  updateData(newValue) {
    const {
      addList,
      removeList,
      updateList
    } = diff(newValue, this.cacheList);

    if (addList.length > 0) {
      this.addLink(addList);
    }
    if (updateList.length > 0) {
      this.updateLink(updateList);
    }
    if (removeList.length > 0) {
      this.deleteLinkByTimeKey(removeList.map((v) => v.timeKey));
    }

    setTimeout(() => {
      this.getAllLinkToSo();
    }, 500);
  }



  // 修改缓存数据
  updateCacheLinkByTimeKey(timeKey, title, url = "") {
    const index = this.list.findIndex((v) => v.timeKey === timeKey);
    if (index !== -1) {
      const link = _.cloneDeep(this.list[index]);
      link.title = title;
      if (url) {
        link.url = url;
      }
      this.list.splice(index, 1, link);
    }
  }

  // 查询所有链接
  getAllLinkToSo() {
    this.rootStore.option.getHomeId().then((homeId) => {
      db.link.where("parentId").notEqual(homeId).and(function (link) {
        return !link.hide;
      }).toArray().then((links) => {
        if (!links) {
          return;
        }
        this._solist = _.filter(links, v => {
          return v.url;
        });
      })
    });
  }

  // 模糊搜索
  async searchLink(searchTerm) {
    const regex = new RegExp(_.escapeRegExp(searchTerm), 'i');
    return _.filter(this._solist, (v) => regex.test(v.title));
  }


  init() {
    this.rootStore.option.getHomeId().then((homeId) => {
      if (!homeId) {
        console.error("未获取到homeId");
        return;
      }
      db.link
        .count()
        .then((res) => {
          if (!res) {
            setTimeout(() => {
              const timeKey = getID();
              const timeKeyPanel = getID();
              const links = [{
                  title: "左抽屉",
                  timeKey,
                  parentId: homeId,
                },
                {
                  title: "右抽屉",
                  timeKey: getID(),
                  parentId: homeId,
                },
                {
                  title: "暗格",
                  timeKey: getID(),
                  parentId: homeId,
                  hide: true,
                },
                {
                  title: "分组（右击标题可以添加至首屏）",
                  parentId: timeKey,
                  timeKey: timeKeyPanel,
                },
                {
                  title: "示例链接",
                  url: "https://www.google.com",
                  parentId: timeKeyPanel,
                  timeKey: getID(),
                },
                {
                  title: "点击可访问",
                  url: "https://github.com",
                  parentId: timeKeyPanel,
                  timeKey: getID(),
                },
                {
                  title: "右击可以删除",
                  url: "https://www.bing.com",
                  parentId: timeKeyPanel,
                  timeKey: getID(),
                },
              ]; 
              this.addLink(links).then(() => {
                this.getNav();
                ["https://www.google.com", "https://github.com", "https://www.bing.com"].forEach((defaultUrl) => {
                  ensureFaviconForUrl(defaultUrl).catch((err) => {
                    console.debug("[favicon] Failed to fetch favicon for default link", defaultUrl, err);
                  });
                });
              })
            }, 0);
          } else {
            this.getNav();
          }
          this.getAllLinkToSo();
        })
        .catch((err) => {
          handleError(err, "LinkStore.init.count");
        });
    });
  }

  getLinkByTimeKey(timeKey) {
    return this.safeDbOperation(
      () => db.link.where("timeKey").equals(timeKey).first(),
      "LinkStore.getLinkByTimeKey"
    );
  }

  async restart() {
    if (!db.isOpen()) {
      await db.open();
    }
    if (this.isInit) {
      this.getNav(true);
    } else {
      this.init();
    }
    this.rootStore.option.init();
  }

  // 获取待添加网址列表
  async getPendingLinks() {
    try {
      const res = await db.link
        .where("parentId")
        .equals(PENDING_LINK_PARENT_ID)
        .toArray();
      const { uniqueLinks } = dedupePendingLinks(res || []);
      return uniqueLinks;
    } catch (err) {
      handleError(err, "LinkStore.getPendingLinks");
      throw err;
    }
  }

  // 添加待添加网址
  async addPendingLink(url, title) {
    const normalizedUrl = normalizePendingLinkUrl(url);

    if (!normalizedUrl) {
      return null;
    }

    try {
      const res = await db.transaction("rw", db.link, async () => {
        const pendingLinks = await db.link
          .where("parentId")
          .equals(PENDING_LINK_PARENT_ID)
          .toArray();
        const sameUrlLinks = pendingLinks.filter((link) => {
          return normalizePendingLinkUrl(link.url) === normalizedUrl;
        });

        if (sameUrlLinks.length > 0) {
          const { uniqueLinks, duplicateLinks } = dedupePendingLinks(sameUrlLinks);
          const duplicateLinkIds = duplicateLinks
            .map((link) => link.linkId)
            .filter((linkId) => Number.isFinite(linkId));

          if (duplicateLinkIds.length > 0) {
            await db.link.where("linkId").anyOf(duplicateLinkIds).delete();
          }

          return uniqueLinks[0];
        }

        const { uniqueLinks } = dedupePendingLinks(pendingLinks);
        const newLink = {
          title: title || normalizedUrl,
          url: normalizedUrl,
          parentId: PENDING_LINK_PARENT_ID,
          sort: uniqueLinks.length,
          timeKey: getID(),
          hide: false,
        };

        await db.link.put(newLink);
        return newLink;
      });
      this.rootStore.data.update();
      return res;
    } catch (err) {
      handleError(err, "LinkStore.addPendingLink");
      throw err;
    }
  }

  // 删除待添加网址
  async removePendingLink(timeKey) {
    try {
      const res = await db.link
        .where("timeKey")
        .equals(timeKey)
        .and((link) => link.parentId === PENDING_LINK_PARENT_ID)
        .delete();
      this.rootStore.data.update();
      return res;
    } catch (err) {
      handleError(err, "LinkStore.removePendingLink");
      throw err;
    }
  }

  // 将待添加网址添加到指定分组
  async addPendingLinksToGroup(timeKey, parentId) {
    let link;
    try {
      link = await db.link
        .where("timeKey")
        .equals(timeKey)
        .and((v) => v.parentId === PENDING_LINK_PARENT_ID)
        .first();
    } catch (err) {
      handleError(err, "LinkStore.addPendingLinksToGroup.get");
      throw err;
    }

    if (!link) {
      throw new Error("Link not found");
    }

    try {
      // 获取目标分组的链接数量，用于设置 sort
      const links = await this.getLinkByParentId([parentId]);
      const res = await db.link.update(link.linkId, {
        ...link,
        parentId,
        sort: links.length,
      });
      this.rootStore.data.update();
      return res;
    } catch (err) {
      handleError(err, "LinkStore.addPendingLinksToGroup.update");
      throw err;
    }
  }

}
