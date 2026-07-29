import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { ReactSortable } from "react-sortablejs";
import { DndContext, useDraggable } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { IconGripHorizontal } from "@tabler/icons-react";
import { useMemoizedFn } from "ahooks";
import _ from "lodash";
import useStores from "~/hooks/useStores";
import useDebounce from "~/hooks/useDebounce";
import LinkItemSmall from "~/scenes/Link/LinkItemSmall";
import { filterLinkList, HOME_ENTER } from "~/utils";
import {
  DRAG_ID_PREFIX,
  buildTitleMap,
  clampPosition,
  computeAnchoredDefaultLayout,
  estimateSize,
  filterRenderableGroups,
  fitAllPositions,
  fromAnchoredPositions,
  placeNewGroups,
  getLayoutAnchor,
  getViewportSize,
  snap,
  toPlainPositions,
} from "~/utils/homeLinkLayout";

const HomeLinkOuter = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${(props) => (props.stickled ? "-1" : "50")};
  /* stickled 时窗格保持挂载（卸载重挂会让下面的过渡失效），
     用 visibility 而非仅 opacity：一并屏蔽命中测试、Tab 焦点与无障碍树。
     CSS 对 visibility 过渡有特殊规则——淡出期间保持 visible，淡入时立即可见。
     时长与缓动同步自壁纸入场，否则返回首页时窗格会先于壁纸出现。 */
  opacity: ${(props) => (props.stickled ? 0 : 1)};
  visibility: ${(props) => (props.stickled ? "hidden" : "visible")};
  transition: opacity ${HOME_ENTER.duration}s ${HOME_ENTER.cssEase},
    visibility ${HOME_ENTER.duration}s ${HOME_ENTER.cssEase};
  overflow: hidden;
  pointer-events: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
`;

/* 定位、拖拽位移、z-index 全部走内联 style（见渲染处）：
   拖拽时每帧变化的值放进 styled 模板会导致 styled-components 每帧生成新 class */
const GroupShell = styled.div`
  position: absolute;
  pointer-events: auto;
  width: fit-content;
`;

const HomeLinkNav = styled.div`
  position: relative;
  width: fit-content;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--homeNavBorderColor);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
    .home-link-drag-handle {
      opacity: 0.85;
    }
  }

  &.dragging {
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    .home-link-drag-handle {
      opacity: 1;
    }
  }
`;

/* 毛玻璃改为"预模糊壁纸对齐"实现：不用 backdrop-filter（Chromium 分块光栅化
   会在其他元素动画/重绘时在卡片上闪现横向接缝），而是在卡片内放一个与壁纸
   同尺寸同 fit 模式的图层（::before），按卡片坐标反向偏移对齐后整体模糊，
   ::after 叠加着色。图层内容静态，光栅化一次后不会再因页面其他部分重绘而
   重新采样。壁纸的 url/fit 由 FirstScreen 以 --frost-bg-* CSS 变量提供
   （挂在 HomeLinkOuter 上）；偏移量 --frost-shift 由卡片渲染处内联提供。
   卡片只出现在第一壁纸上（bg2 预览时分组会被清空），故无需处理 bg2。 */
const Frost = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    transform: var(--frost-shift, none);
    background-image: var(--frost-bg-image, none);
    background-repeat: var(--frost-bg-repeat, no-repeat);
    background-position: var(--frost-bg-position, center center);
    background-size: var(--frost-bg-size, cover);
    opacity: var(--homeImgOpacity, 1);
    filter: saturate(180%) blur(20px);
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background-color: var(--homeNavBg);
  }
`;

const DragHandle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 16px;
  margin: -4px 0 6px;
  padding: 2px 0 4px;
  cursor: grab;
  color: var(--textColor);
  opacity: 0.35;
  transition: opacity 0.2s;
  touch-action: none;
  &:active {
    cursor: grabbing;
  }
  svg {
    flex-shrink: 0;
  }
`;

const GroupTitle = styled.div`
  font-size: 12px;
  line-height: 1.2;
  color: var(--textColor);
  opacity: 0.7;
  padding: 0 2px;
  letter-spacing: 0.3px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
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

function areGroupPropsEqual(prev, next) {
  return (
    prev.left === next.left &&
    prev.top === next.top &&
    prev.zIndex === next.zIndex &&
    prev.title === next.title &&
    prev.isSoBarDown === next.isSoBarDown &&
    prev.showHomeLink === next.showHomeLink &&
    prev.showGroupTitle === next.showGroupTitle &&
    prev.group?.timeKey === next.group?.timeKey &&
    prev.group?.links === next.group?.links
  );
}

const HomeLinkGroupInner = (props) => {
  const {
    group,
    title,
    isSoBarDown,
    showHomeLink,
    showGroupTitle,
    left,
    top,
    zIndex,
  } = props;
  const { timeKey } = group;
  const { link } = useStores();
  const [linkList, setLinkList] = React.useState([]);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: DRAG_ID_PREFIX + timeKey,
    });

  React.useEffect(() => {
    if (group.links && Array.isArray(group.links)) {
      setLinkList(group.links);
    } else {
      setLinkList([]);
    }
  }, [group.links]);

  const onUpdateSort = useDebounce((value) => {
    if (!timeKey || !value || value.length === 0) {
      return;
    }
    const updatedList = filterLinkList(value, timeKey);
    const otherLinks = link.list.filter((v) => v.parentId !== timeKey);
    link.list.replace([...otherLinks, ...updatedList]);
    link.updateLink(updatedList).then(() => {
      setTimeout(() => {
        link.setCache();
      }, 0);
    });
  }, 150);

  const handleSort = useMemoizedFn(
    (newList) => {
      setLinkList(newList);
      onUpdateSort(newList);
    },
    [onUpdateSort]
  );

  if (
    !timeKey ||
    !linkList ||
    !Array.isArray(linkList) ||
    linkList.length === 0
  ) {
    return null;
  }

  const cols = Math.min(linkList.length, 4);
  const showTitle = showGroupTitle && title && showHomeLink;
  const tx = transform?.x || 0;
  const ty = transform?.y || 0;

  return (
    <GroupShell
      ref={setNodeRef}
      {...attributes}
      style={{
        left,
        top,
        transform: `translate3d(${tx}px, ${ty}px, 0)`,
        zIndex: isDragging ? 100 : zIndex,
        willChange: isDragging ? "transform" : "auto",
      }}
    >
      <HomeLinkNav
        className={isDragging ? "dragging" : ""}
        style={{
          "--home-link-cols": cols,
          "--frost-shift": `translate(${-(left + tx)}px, ${-(top + ty)}px)`,
        }}
      >
        <Frost />
        <DragHandle
          className="home-link-drag-handle"
          {...listeners}
          title="拖动调整位置"
        >
          <IconGripHorizontal size={14} stroke={1.6} />
          {showTitle ? <GroupTitle title={title}>{title}</GroupTitle> : null}
        </DragHandle>
        <ReactSortable
          tag={SortableWrapper}
          list={linkList}
          setList={handleSort}
          animation={150}
          ghostClass="home-link-ghost"
          disabled={isDragging}
        >
          {showHomeLink &&
            linkList.map((v) => {
              if (!v || !v.timeKey) {
                return null;
              }
              return (
                <div
                  key={v.timeKey}
                  style={{ pointerEvents: isDragging ? "none" : "auto" }}
                >
                  <LinkItemSmall isSoBarDown={isSoBarDown} {...v} />
                </div>
              );
            })}
        </ReactSortable>
      </HomeLinkNav>
    </GroupShell>
  );
};

const HomeLinkGroup = React.memo(HomeLinkGroupInner, areGroupPropsEqual);

const VIEWPORT_FIT_OPTIONS = { fitVertical: false };

function useLiveViewportSize() {
  const [viewport, setViewport] = React.useState(getViewportSize);

  React.useEffect(() => {
    let frameId = null;

    const handleResize = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setViewport(getViewportSize());
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return viewport;
}

const HomeLinkListComponent = (props) => {
  const {
    homeGroups,
    isSoBarDown,
    stickled,
    showHomeLink,
    showGroupTitle = true,
    frostStyle,
  } = props;
  const { option, tools, link } = useStores();
  const layoutEpoch = tools.homeLinkLayoutEpoch;
  const [activeKey, setActiveKey] = React.useState(null);
  const viewport = useLiveViewportSize();
  const [positions, setPositions] = React.useState(() =>
    toPlainPositions(option.item.homeLinkPositions)
  );
  const positionsRef = React.useRef(positions);
  const initedKeysRef = React.useRef("");
  const appliedEpochRef = React.useRef(layoutEpoch);
  const validGroupsRef = React.useRef([]);

  const validGroups = React.useMemo(
    () => filterRenderableGroups(homeGroups),
    [homeGroups]
  );

  validGroupsRef.current = validGroups;

  const validKeySig = validGroups.map((g) => g.timeKey).join(",");

  const titleByKey = React.useMemo(() => {
    if (!showGroupTitle) return {};
    return buildTitleMap(
      link.list,
      validGroups.map((g) => g.timeKey)
    );
  }, [link.list, validKeySig, showGroupTitle, validGroups]);

  const persistPositions = useMemoizedFn((next) => {
    const plain = toPlainPositions(next);
    positionsRef.current = plain;
    setPositions(plain);
    option.setItem("homeLinkPositions", plain, false).catch((err) => {
      console.error("[homeLinkPositions] save failed:", err);
    });
  });

  React.useEffect(() => {
    if (validGroups.length === 0) return;

    const forceRelayout = layoutEpoch !== appliedEpochRef.current;

    if (!forceRelayout && initedKeysRef.current === validKeySig) return;

    const fromStore = toPlainPositions(option.item.homeLinkPositions);

    const missing = validGroups.filter((g) => !fromStore[g.timeKey]);

    const validSet = new Set(validGroups.map((g) => g.timeKey));
    const pruned = {};
    Object.keys(fromStore).forEach((k) => {
      if (validSet.has(k)) pruned[k] = fromStore[k];
    });

    initedKeysRef.current = validKeySig;
    appliedEpochRef.current = layoutEpoch;

    if (missing.length === 0) {
      if (!_.isEqual(pruned, fromStore)) {
        persistPositions(pruned);
      } else {
        positionsRef.current = pruned;
        setPositions(pruned);
      }
      return;
    }

    let additions;
    if (Object.keys(pruned).length === 0) {
      additions = computeAnchoredDefaultLayout(
        missing,
        showGroupTitle,
        isSoBarDown,
        viewport
      ).positions;
    } else {
      additions = placeNewGroups(missing, pruned);
    }

    persistPositions({ ...pruned, ...additions });
  }, [
    validKeySig,
    showGroupTitle,
    isSoBarDown,
    layoutEpoch,
    validGroups,
    option,
    persistPositions,
    viewport,
  ]);

  const visiblePositions = React.useMemo(() => {
    const absolute = fromAnchoredPositions(
      positions,
      isSoBarDown,
      viewport
    );
    return fitAllPositions(
      absolute,
      validGroups,
      showGroupTitle,
      viewport,
      VIEWPORT_FIT_OPTIONS
    ).next;
  }, [isSoBarDown, positions, showGroupTitle, validGroups, viewport]);

  const handleDragStart = useMemoizedFn((event) => {
    const id = String(event.active?.id || "");
    if (id.startsWith(DRAG_ID_PREFIX)) {
      setActiveKey(id.slice(DRAG_ID_PREFIX.length));
    }
  });

  const handleDragEnd = useMemoizedFn((event) => {
    const { active, delta } = event;
    const id = String(active?.id || "");
    if (!id.startsWith(DRAG_ID_PREFIX)) return;

    const timeKey = id.slice(DRAG_ID_PREFIX.length);
    const prev =
      visiblePositions[timeKey] ||
      positionsRef.current[timeKey] ||
      { left: 0, top: 0 };
    const dx = delta?.x || 0;
    const dy = delta?.y || 0;
    if (dx === 0 && dy === 0) return;

    const group = validGroupsRef.current.find((g) => g.timeKey === timeKey);
    const size = estimateSize(group?.links?.length || 1, showGroupTitle);
    const raw = {
      left: snap(prev.left + dx),
      top: snap(prev.top + dy),
    };
    const clamped = clampPosition(raw.left, raw.top, size.w, size.h);
    const anchor = getLayoutAnchor(isSoBarDown, viewport);
    const anchored = {
      left: clamped.left - anchor.left,
      top: clamped.top - anchor.top,
    };

    persistPositions({
      ...positionsRef.current,
      [timeKey]: anchored,
    });
  });

  if (validGroups.length === 0) {
    return null;
  }

  return (
    <HomeLinkOuter stickled={stickled} style={frostStyle}>
      <DndContext
        autoScroll={false}
        modifiers={[restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {validGroups.map((group, index) => {
          const pos = visiblePositions[group.timeKey] || {
            left: 40 + index * 24,
            top: 200 + index * 24,
          };
          return (
            <HomeLinkGroup
              key={group.timeKey}
              group={group}
              title={titleByKey[group.timeKey]}
              isSoBarDown={isSoBarDown}
              showHomeLink={showHomeLink}
              showGroupTitle={showGroupTitle}
              left={pos.left}
              top={pos.top}
              zIndex={activeKey === group.timeKey ? 20 : index + 1}
            />
          );
        })}
      </DndContext>
    </HomeLinkOuter>
  );
};

const HomeLinkList = React.memo(observer(HomeLinkListComponent));

export default HomeLinkList;
