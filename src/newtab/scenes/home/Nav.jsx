import React from "react";
import { observer } from "mobx-react";
import { Divider } from "antd";
import styled from "styled-components";
import {
  IconPencilMinus,
  IconFolderPlus,
  IconTrashX,
  IconFolder,
  IconSettings,
  IconArrowsMove,
} from "@tabler/icons-react";
import { getID } from "~/utils";
import useStores from "~/hooks/useStores";
import { useReactive, useCreation, useMemoizedFn } from "ahooks";
import { useNavigate, useLocation } from 'react-router-dom';
import { headerHeight } from "~/view/Home";
import manifest from "../../../manifest";
import Storage from "~/utils/storage";


function getItem({
  label,
  key,
  icon,
  children,
  id,
  type,
  _info,
}) {
  return {
    key,
    icon,
    children,
    label,
    type,
    _info,
    id
  };
}

const saveLActiveCache = (e) => {
  Storage.set('navActive', {
    type: e.type,
    _key: e.key
  }).catch((err) => {
    console.error('Failed to save nav active cache:', err);
  })
}

const NavWrap = styled.div`
  height: 100vh;
  background: var(--workspaceSidebar);
  margin: 0;
  padding: calc(${(props) => props.headerHeight}px + 12px) 8px 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;

const NavTOP = styled.ul`
  overflow-y: auto;
  flex: 1;
  padding: 10px 8px;
  box-sizing: border-box;
  margin: 0;
  list-style: none;
  background: transparent;

  .ant-divider {
    height: 6px;
    margin: 10px 0 !important;
    border: 0;
  }
`;
const NavBottom = styled.div`
  padding: 10px 4px 2px 0;
  box-sizing: border-box;
  margin: 0px;
  display: flex;
  -webkit-box-align: center;
  align-items: baseline;
  -webkit-box-pack: center;
  justify-content: center;
  gap: 12px;
  height: 32px;
  line-height: 1;
  > span {
    font-size: 12px;
    color: var(--workspaceMuted);
    cursor: pointer;
    &:hover{
      color: #999;
    }
  }
  > i {
    font-size: 10px;
    color: var(--workspaceMuted);
    font-style: normal;
  }
`;

const NavLi = styled.li`
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 40px;
  gap: 10px;
  cursor: pointer;
  border-radius: 11px;
  margin: 0;
  color: var(--colorText);
  opacity: 0.72;
  transition: background-color 0.2s ease, opacity 0.2s ease,
    color 0.2s ease, transform 0.2s ease;
  position: relative;

  &:hover:not(.active) {
    opacity: 1;
    background: var(--workspaceHover);
  }

  &.active {
    opacity: 1;
    font-weight: 500;
    color: var(--workspaceNavActiveText);
    background: var(--workspaceNavActive);

    svg {
      opacity: 0.96;
    }
  }

  &:active {
    transform: scale(0.985);
  }

  span {
    font-size: 13.5px;
    letter-spacing: -0.01em;
  }

  svg {
    flex: none;
    opacity: 0.78;
  }

  & + & {
    margin-top: 3px;
  }

  &:last-child {
    margin-bottom: 28px;
  }
`;

const Nav = () => {
  const { link, tools } = useStores();
  const navigate = useNavigate();
  const location = useLocation();

  const state = useReactive(
    {
      activeKey: "",
    },
    []
  );

  const onLinkTitleClick = useMemoizedFn(
    (timeKey) => {
      if (timeKey != state.activeKey) {
        state.activeKey = timeKey;
        link.setActiveId(timeKey);
      }
    },
    [link]
  );

  const foo = useCreation(() => {
    const links = link.linkNav.map((item) => {
      return getItem({
        label: item.title,
        key: item.timeKey,
        id: item.linkId,
        icon: <IconFolder size={17} stroke={1.4} />,
        type: "link",
        _info: item,
      });
    });

    return [
      ...links,
      { type: "divider" },
      getItem({
        label: "首选项",
        key: "preferences",
        icon: <IconSettings size={17} stroke={1.4} />,
      }),
    ];
  }, [link.linkNav]);

  const isActive = useMemoizedFn(
    (key, type) => {
      if (type === "link" && location.pathname === "/") {
        return state.activeKey == key;
      }
      return false;
    },
    [state.activeKey, location.pathname]
  );

  const onClick = useMemoizedFn(
    (e) => {
      if (e.type === "link") {
        navigate("/");
        onLinkTitleClick(e.key);
        saveLActiveCache(e);
      } else if (e.key === "preferences") {
        tools.preferencesOpen = true;
      } else if (e.key === "Manual" || e.key === "About") {
        tools.openPublicModal("About", {}, 560, "关于");
      } else if (e.key === "export") {
        tools.onExport();
      }
    },
    [navigate, onLinkTitleClick, tools]
  );

  const onContextMenu = useMemoizedFn((e, props) => {
    e.stopPropagation();
    e.preventDefault();
    const menuArr = [];

    if (props.type == "link") {
      menuArr.push({
        label: "重命名",
        key: "edit-link",
        icon: <IconPencilMinus />,
        onClick: () => {
          tools.openPublicModal(
            "EditLink",
            {
              title: props.label,
              timeKey: props.key,
              linkId: props.id,
              type: 'menu',
              modalTitle: '重命名',
              cb: () => {
                link.updateNav();
              }
            },
            400
          );
        },
      });
      menuArr.push({
        label: "移动抽屉",
        icon: <IconArrowsMove />,
        key: "move-group",
        onClick: () => {
          tools.openPublicModal("MoveGroup", {
          }, 500, '移动抽屉');
        },
      });
      menuArr.push({
        label: "删除页面",
        icon: <IconTrashX />,
        key: "del-link",
        onClick: () => {
          const link_nav = foo ? foo.filter((v) => v && v.type == "link") : [];

          if (props._info && props._info.hide) {
            tools.messageApi.warning('暗格无法删除')
            return
          }

          if (!link_nav || link_nav.length <= 1) {
            tools.messageApi.warning('请至少保留一个页面')
            return
          }

          link.getLinkByParentId(props.key).then((res) => {
            if (res && Array.isArray(res) && res.length) {
              tools.messageApi.warning('请先清空页面下的所有链接和分组')
              return
            }
            link.deleteLinkByTimeKey(props.key).then(() => {
              if (link.getActiveID == props.key) {
                link.activeId = ""
                link.getNav()
                setTimeout(() => {
                  state.activeKey = link.getActiveID;
                }, 300);
              } else {
                link.updateNav();
              }
            }).catch((err) => {
              console.error('Failed to delete link:', err);
              tools.messageApi.error('删除失败');
            });
          }).catch((err) => {
            console.error('Failed to get link by parent id:', err);
            tools.messageApi.error('获取链接信息失败');
          });
        },
      });
      menuArr.push({
        label: "新建抽屉",
        key: "new-link",
        icon: <IconFolderPlus />,
        onClick: () => {
          if (link.linkNav && link.linkNav.length > 0) {
            link.addLink({
              parentId: link.linkNav[link.linkNav.length - 1].parentId,
              title: '新抽屉',
              timeKey: getID()
            }).then((res) => {
              link.updateNav();
            }).catch((err) => {
              console.error('Failed to add link:', err);
              tools.messageApi.error('添加失败');
            });
          }
        },
      });
    }

    tools.setRightClickEvent(e, menuArr);
  }, [link, tools, foo]);

  React.useEffect(() => {
    if (!state.activeKey) {
      if (link.linkNav && link.linkNav.length > 0 && link.linkNav[0]?.timeKey) {
        state.activeKey = link.linkNav[0].timeKey;
      }
    }
  }, [link.linkNav]);

  React.useEffect(() => {
    Storage.get("navActive").then((e) => {
      // 忽略已移除的便签导航缓存
      if (e && e.type === "link" && e._key) {
        setTimeout(() => {
          onClick({
            type: e.type,
            key: e._key,
          });
        }, 100);
      }
    });
  }, [onClick]);

  return (
    <NavWrap headerHeight={headerHeight}>
      <NavTOP className="scroll-container">
        {foo.map((v, k) => {
          if (v.type === "divider") {
            return <Divider key={v.key} style={{ margin: "8px 0" }} />;
          }
          return (
            <NavLi
              className={isActive(v.key, v.type) ? "active" : ""}
              onClick={() => onClick(v)}
              onContextMenu={(e) => onContextMenu(e, v)}
              key={v.key}
            >
              {v.icon}
              <span>{v.label}</span>
            </NavLi>
          )
        })}
      </NavTOP>
      <NavBottom>
        <span onClick={() => onClick({ key: 'About' })}>关于</span>
        <i>v{manifest.version}</i>
      </NavBottom>
    </NavWrap>
  );
};
export default observer(Nav);
