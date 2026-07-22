import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { ReactSortable } from "react-sortablejs";
import { DndContext, useDraggable } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { useMemoizedFn } from "ahooks";
import useStores from "~/hooks/useStores";
import useDebounce from "~/hooks/useDebounce";
import LinkItemSmall from "~/scenes/Link/LinkItemSmall";
import { filterLinkList } from "~/utils";
import { IconGripHorizontal } from "@tabler/icons-react";
import _ from "lodash";

const SNAP = 10;
const ICON_SLOT = 58;
const GAP = 15;
const CARD_PAD = 32;
const TITLE_H = 22;
const DRAG_ID_PREFIX = "home-link-group_";

const HomeLinkOuter = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${(props) => (props.stickled ? "-1" : "50")};
  overflow: hidden;
  pointer-events: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
`;

const DndSurface = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

const GroupShell = styled.div`
  position: absolute;
  left: ${(props) => props.$left}px;
  top: ${(props) => props.$top}px;
  transform: translate3d(
    ${(props) => props.$tx || 0}px,
    ${(props) => props.$ty || 0}px,
    0
  );
  z-index: ${(props) => props.$zIndex || 1};
  pointer-events: auto;
  width: fit-content;
  will-change: ${(props) => (props.$dragging ? "transform" : "auto")};
`;

const HomeLinkNav = styled.div`
  width: fit-content;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--homeNavBorderColor);
  /* 毛玻璃必须在元素自身上，不要放 ::before，否则会出现半边糊半边不糊 */
  background-color: var(--homeNavBg);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
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

function snap(n) {
  return Math.round(n / SNAP) * SNAP;
}

function estimateSize(linkCount, showTitle) {
  const cols = Math.min(Math.max(linkCount, 1), 4);
  const rows = Math.ceil(Math.max(linkCount, 1) / cols);
  const w = cols * ICON_SLOT + (cols - 1) * GAP + CARD_PAD;
  const h =
    rows * ICON_SLOT + (rows - 1) * GAP + CARD_PAD + (showTitle ? TITLE_H : 8);
  return { w, h };
}

/** 无已存坐标时，用 3 列瀑布流生成默认绝对坐标（相对视口） */
function computeDefaultPositions(groups, showGroupTitle, isSoBarDown) {
  if (!groups.length) return {};
  const items = groups.map((g) => ({
    timeKey: g.timeKey,
    ...estimateSize(g.links?.length || 1, showGroupTitle),
  }));
  const colCount = Math.min(3, items.length);
  const cols = Array.from({ length: colCount }, () => ({
    items: [],
    height: 0,
    width: 0,
  }));
  items.forEach((item) => {
    let target = cols[0];
    for (const c of cols) {
      if (c.height < target.height) target = c;
    }
    target.items.push(item);
    target.height += item.h + GAP;
    target.width = Math.max(target.width, item.w);
  });

  const totalW =
    cols.reduce((s, c) => s + c.width, 0) + Math.max(0, colCount - 1) * GAP;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const startX = Math.max(16, (vw - totalW) / 2);
  const startY = isSoBarDown
    ? Math.max(24, vh * 0.12)
    : Math.max(80, vh * 0.3 + 60);

  const positions = {};
  let x = startX;
  cols.forEach((col) => {
    let y = startY;
    col.items.forEach((item) => {
      positions[item.timeKey] = {
        left: snap(x),
        top: snap(y),
      };
      y += item.h + GAP;
    });
    x += col.width + GAP;
  });
  return positions;
}

/** 已有部分坐标时，给新分组找不重叠的起点 */
function placeNewGroups(groups, existing, isSoBarDown) {
  if (!groups.length) return {};
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let anchorLeft = Math.max(24, vw / 2 - 80);
  let anchorTop = isSoBarDown
    ? Math.max(24, vh * 0.12)
    : Math.max(80, vh * 0.3 + 60);

  const existingEntries = Object.values(existing || {});
  if (existingEntries.length > 0) {
    let maxRight = 0;
    let minTop = Infinity;
    existingEntries.forEach((p) => {
      if (typeof p?.left === "number") maxRight = Math.max(maxRight, p.left + 120);
      if (typeof p?.top === "number") minTop = Math.min(minTop, p.top);
    });
    if (minTop !== Infinity) anchorTop = minTop;
    anchorLeft = Math.min(maxRight + GAP, vw - 160);
  }

  const positions = {};
  groups.forEach((g, i) => {
    positions[g.timeKey] = {
      left: snap(anchorLeft + i * 24),
      top: snap(anchorTop + i * 24),
    };
  });
  return positions;
}

function toPlainPositions(raw) {
  if (!raw || typeof raw !== "object") return {};
  const plain = {};
  Object.keys(raw).forEach((k) => {
    const p = raw[k];
    if (p && typeof p.left === "number" && typeof p.top === "number") {
      plain[k] = { left: p.left, top: p.top };
    }
  });
  return plain;
}

const HomeLinkGroup = observer((props) => {
  const {
    group,
    isSoBarDown,
    showHomeLink,
    glassMode,
    showGroupTitle,
    left,
    top,
    zIndex,
  } = props;
  const { timeKey } = group;
  const { link } = useStores();
  const [linkList, setLinkList] = React.useState([]);
  const title = showGroupTitle
    ? link.list.find((v) => v.timeKey === timeKey)?.title
    : null;

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

  if (!timeKey || !linkList || !Array.isArray(linkList) || linkList.length === 0) {
    return null;
  }

  const cols = Math.min(linkList.length, 4);

  return (
    <GroupShell
      ref={setNodeRef}
      {...attributes}
      $left={left}
      $top={top}
      $tx={transform?.x || 0}
      $ty={transform?.y || 0}
      $zIndex={isDragging ? 100 : zIndex}
      $dragging={isDragging}
    >
      <HomeLinkNav
        className={isDragging ? "dragging" : ""}
        style={{ "--home-link-cols": cols }}
      >
        <DragHandle
          className="home-link-drag-handle"
          {...listeners}
          title="拖动调整位置"
        >
          <IconGripHorizontal size={14} stroke={1.6} />
          {title && showHomeLink ? (
            <GroupTitle title={title}>{title}</GroupTitle>
          ) : null}
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
                  <LinkItemSmall
                    isSoBarDown={isSoBarDown}
                    {...v}
                    skipEnterAnimation
                    className={glassMode ? "glass-card" : ""}
                  />
                </div>
              );
            })}
        </ReactSortable>
      </HomeLinkNav>
    </GroupShell>
  );
});

const HomeLinkListComponent = (props) => {
  const {
    homeGroups,
    isSoBarDown,
    stickled,
    showHomeLink,
    glassMode,
    showGroupTitle = true,
  } = props;
  const { option, tools } = useStores();
  const layoutEpoch = tools.homeLinkLayoutEpoch;
  const [activeKey, setActiveKey] = React.useState(null);
  // 本地位置状态：拖拽与展示都以此为准，落库用 setItem
  const [positions, setPositions] = React.useState(() =>
    toPlainPositions(option.item.homeLinkPositions)
  );
  const positionsRef = React.useRef(positions);
  const initedKeysRef = React.useRef("");
  const appliedEpochRef = React.useRef(layoutEpoch);

  const validGroups = React.useMemo(() => {
    if (!homeGroups || !Array.isArray(homeGroups)) return [];
    return homeGroups.filter(
      (g) => g && g.timeKey && Array.isArray(g.links) && g.links.length > 0
    );
  }, [homeGroups]);

  const validKeySig = validGroups.map((g) => g.timeKey).join(",");

  /** 统一写本地 state + IndexedDB（toPlainPositions 已是纯对象，无需 cloneDeep） */
  const persistPositions = useMemoizedFn((next) => {
    const plain = toPlainPositions(next);
    positionsRef.current = plain;
    setPositions(plain);
    option.setItem("homeLinkPositions", plain, false).catch((err) => {
      console.error("[homeLinkPositions] save failed:", err);
    });
  });

  // 补全缺失坐标 / 重置重排；不依赖 homeLinkPositions，避免拖拽落库反复进 effect
  React.useEffect(() => {
    if (validGroups.length === 0) return;

    const forceRelayout = layoutEpoch !== appliedEpochRef.current;

    // 同批 keys 只初始化一次；显式 epoch 变化时强制重排
    if (!forceRelayout && initedKeysRef.current === validKeySig) return;

    const fromStore = forceRelayout
      ? {}
      : toPlainPositions(option.item.homeLinkPositions);

    const missing = forceRelayout
      ? validGroups
      : validGroups.filter((g) => !fromStore[g.timeKey]);

    const validSet = new Set(validGroups.map((g) => g.timeKey));
    const pruned = {};
    if (!forceRelayout) {
      Object.keys(fromStore).forEach((k) => {
        if (validSet.has(k)) pruned[k] = fromStore[k];
      });
    }

    initedKeysRef.current = validKeySig;
    appliedEpochRef.current = layoutEpoch;

    if (missing.length === 0) {
      // 仅同步本地；有失效 key 时统一走 persist 剪枝落库
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
      additions = computeDefaultPositions(
        missing,
        showGroupTitle,
        isSoBarDown
      );
    } else {
      additions = placeNewGroups(missing, pruned, isSoBarDown);
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
  ]);

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
    const prev = positionsRef.current[timeKey] || { left: 0, top: 0 };
    const dx = delta?.x || 0;
    const dy = delta?.y || 0;
    if (dx === 0 && dy === 0) return;

    const nextPos = {
      left: snap(prev.left + dx),
      top: snap(prev.top + dy),
    };
    const next = {
      ...positionsRef.current,
      [timeKey]: nextPos,
    };
    persistPositions(next);
  });

  if (validGroups.length === 0) {
    return null;
  }

  return (
    <HomeLinkOuter stickled={stickled}>
      <DndContext
        autoScroll={false}
        modifiers={[restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DndSurface>
          {validGroups.map((group, index) => {
            const pos = positions[group.timeKey] || {
              left: 40 + index * 24,
              top: 200 + index * 24,
            };
            return (
              <HomeLinkGroup
                key={group.timeKey}
                group={group}
                isSoBarDown={isSoBarDown}
                showHomeLink={showHomeLink}
                glassMode={glassMode}
                showGroupTitle={showGroupTitle}
                left={pos.left}
                top={pos.top}
                zIndex={activeKey === group.timeKey ? 20 : index + 1}
              />
            );
          })}
        </DndSurface>
      </DndContext>
    </HomeLinkOuter>
  );
};

const HomeLinkList = React.memo(observer(HomeLinkListComponent));

export default HomeLinkList;
