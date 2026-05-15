import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { AnimatePresence } from "framer-motion";
import { ReactSortable } from "react-sortablejs";
import { useMemoizedFn } from "ahooks";
import useStores from "~/hooks/useStores";
import useDebounce from "~/hooks/useDebounce";
import LinkItemSmall from "~/scenes/Link/LinkItemSmall";
import { filterLinkList } from "~/utils";
import _ from "lodash";

const HomeLinkOuter = styled.div`
  position: absolute;
  z-index: ${(props) => (props.stickled ? "-1" : "50")};
  left: 50%;
  top: calc(${(props) => (props.isSoBarDown ? "85vh - 10px" : "30vh + 60px")});
  transform: translateX(-50%) ${(props) => (props.isSoBarDown ? "translateY(-100%)" : "")};
  display: flex;
  align-items: flex-start;
  gap: 15px;
  max-width: 92vw;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
`;

const MasonryColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const HomeLinkNav = styled.div`
  width: fit-content;
  padding: 14px 16px;
  border-radius: 16px;
  transition: border-color 0.3s, background-color 0.3s, backdrop-filter 0.3s;
  background-color: var(--homeNavBg);
  border: 1px solid var(--homeNavBorderColor);
  backdrop-filter: saturate(180%) blur(20px);
  &:hover {
    background-color: var(--homeNavBg);
    border-color: var(--homeNavBorderColor);
    filter: brightness(1.08);
  }
`;

const GroupTitle = styled.div`
  font-size: 12px;
  line-height: 1.2;
  color: var(--textColor);
  opacity: 0.7;
  padding: 0 2px 10px;
  letter-spacing: 0.3px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SortableContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(var(--home-link-cols, 4), auto);
  gap: 15px;
  justify-content: start;
`;

const SortableWrapper = React.forwardRef((props, ref) => {
  return <SortableContainer ref={ref}>{props.children}</SortableContainer>;
});

const HomeLinkGroup = observer((props) => {
  const { group, isSoBarDown, showHomeLink, glassMode, showGroupTitle } = props;
  const { timeKey } = group;
  const { link } = useStores();
  const [linkList, setLinkList] = React.useState([]);
  const title = showGroupTitle ? link.list.find((v) => v.timeKey === timeKey)?.title : null;

  // 同步外部传入的链接到内部 state
  React.useEffect(() => {
    if (group.links && Array.isArray(group.links)) {
      setLinkList(group.links);
    } else {
      setLinkList([]);
    }
  }, [group.links]);

  // 防抖保存排序
  const onUpdateSort = useDebounce((value) => {
    if (!timeKey || !value || value.length === 0) {
      return;
    }
    // 使用 filterLinkList 更新 sort 字段
    const updatedList = filterLinkList(value, timeKey);

    // 替换 link.list 中 parentId 相同的数据，避免多次 MobX 反应
    const otherLinks = link.list.filter((v) => v.parentId !== timeKey);
    link.list.replace([...otherLinks, ...updatedList]);

    // 保存到数据库
    link.updateLink(updatedList).then(() => {
      setTimeout(() => {
        link.setCache();
      }, 0);
    });
  }, 150);

  // 处理拖拽排序
  const handleSort = useMemoizedFn((newList) => {
    setLinkList(newList);
    onUpdateSort(newList);
  }, [onUpdateSort]);

  // 如果没有链接，不渲染该分组
  if (!timeKey || !linkList || !Array.isArray(linkList) || linkList.length === 0) {
    return null;
  }

  const cols = Math.min(linkList.length, 4);

  return (
    <HomeLinkNav style={{ "--home-link-cols": cols }}>
      {title && showHomeLink ? <GroupTitle title={title}>{title}</GroupTitle> : null}
      <ReactSortable
        tag={SortableWrapper}
        list={linkList}
        setList={handleSort}
        animation={150}
        ghostClass="home-link-ghost"
      >
        <AnimatePresence>
          {showHomeLink && linkList.map((v) => {
            if (!v || !v.timeKey) {
              return null;
            }
            return (
              <div key={v.timeKey}>
                <LinkItemSmall
                  isSoBarDown={isSoBarDown}
                  {...v}
                  className={glassMode ? 'glass-card' : ''}
                />
              </div>
            );
          })}
        </AnimatePresence>
      </ReactSortable>
    </HomeLinkNav>
  );
});

const HomeLinkListComponent = (props) => {
  const { homeGroups, isSoBarDown, stickled, showHomeLink, glassMode, showGroupTitle = true } = props;

  // 过滤出有链接的有效分组（必须在所有 hooks 之前计算）
  const validGroups = React.useMemo(() => {
    if (!homeGroups || !Array.isArray(homeGroups)) return [];
    return homeGroups.filter(
      (g) => g && g.timeKey && Array.isArray(g.links) && g.links.length > 0
    );
  }, [homeGroups]);

  // 贪心分列（masonry）：按估算高度把每个分组放进当前最矮的列
  const columns = React.useMemo(() => {
    if (validGroups.length === 0) return [];
    const colCount = Math.min(3, validGroups.length);
    const cols = Array.from({ length: colCount }, () => ({
      items: [],
      height: 0,
    }));
    validGroups.forEach((group) => {
      // 每行约 5 个图标，每个图标槽约 73px，加上卡片上下 padding；启用标题时再加一行
      const rows = Math.ceil(group.links.length / 5);
      const estHeight = rows * 73 + 30 + (showGroupTitle ? 24 : 0);
      let target = cols[0];
      for (const col of cols) {
        if (col.height < target.height) {
          target = col;
        }
      }
      target.items.push(group);
      target.height += estHeight + 15;
    });
    return cols;
  }, [validGroups, showGroupTitle]);

  if (validGroups.length === 0) {
    return null;
  }

  return (
    <HomeLinkOuter isSoBarDown={isSoBarDown} stickled={stickled}>
      {columns.map((col, i) => (
        <MasonryColumn key={i}>
          {col.items.map((group) => (
            <HomeLinkGroup
              key={group.timeKey}
              group={group}
              isSoBarDown={isSoBarDown}
              showHomeLink={showHomeLink}
              glassMode={glassMode}
              showGroupTitle={showGroupTitle}
            />
          ))}
        </MasonryColumn>
      ))}
    </HomeLinkOuter>
  );
};

const HomeLinkList = React.memo(observer(HomeLinkListComponent));

export default HomeLinkList;
