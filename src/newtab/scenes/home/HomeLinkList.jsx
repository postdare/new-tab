import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { ReactSortable } from "react-sortablejs";
import { DndContext, useDraggable } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { IconGripHorizontal } from "@tabler/icons-react";
import { useMemoizedFn, useDebounceFn } from "ahooks";
import _ from "lodash";
import useStores from "~/hooks/useStores";
import useDebounce from "~/hooks/useDebounce";
import LinkItemSmall from "~/scenes/Link/LinkItemSmall";
import { filterLinkList } from "~/utils";
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
  overflow: hidden;
  pointer-events: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
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

function areGroupPropsEqual(prev, next) {
  return (
    prev.left === next.left &&
    prev.top === next.top &&
    prev.zIndex === next.zIndex &&
    prev.title === next.title &&
    prev.isSoBarDown === next.isSoBarDown &&
    prev.showHomeLink === next.showHomeLink &&
    prev.glassMode === next.glassMode &&
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
    glassMode,
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
                  <LinkItemSmall
                    isSoBarDown={isSoBarDown}
                    {...v}
                    className={glassMode ? "glass-card" : ""}
                  />
                </div>
              );
            })}
        </ReactSortable>
      </HomeLinkNav>
    </GroupShell>
  );
};

// memo 挡掉「拖一个分组时兄弟重渲染」；内部不在 render 期读 observable，无需 observer
const HomeLinkGroup = React.memo(HomeLinkGroupInner, areGroupPropsEqual);

const HomeLinkListComponent = (props) => {
  const {
    homeGroups,
    isSoBarDown,
    stickled,
    showHomeLink,
    glassMode,
    showGroupTitle = true,
  } = props;
  const { option, tools, link } = useStores();
  const layoutEpoch = tools.homeLinkLayoutEpoch;
  const [activeKey, setActiveKey] = React.useState(null);
  const [viewport, setViewport] = React.useState(getViewportSize);
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

  // F12/窗口缩放只更新临时渲染视口，不覆盖用户保存的分组坐标。
  const { run: updateViewportOnResize } = useDebounceFn(
    () => {
      setViewport(getViewportSize());
    },
    { wait: 150 }
  );

  React.useEffect(() => {
    window.addEventListener("resize", updateViewportOnResize);
    return () => window.removeEventListener("resize", updateViewportOnResize);
  }, [updateViewportOnResize]);

  const visiblePositions = React.useMemo(
    () => {
      const absolute = fromAnchoredPositions(
        positions,
        isSoBarDown,
        viewport
      );
      return fitAllPositions(
        absolute,
        validGroups,
        showGroupTitle,
        viewport
      ).next;
    },
    [isSoBarDown, positions, showGroupTitle, validGroups, viewport]
  );

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
    <HomeLinkOuter stickled={stickled}>
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
              glassMode={glassMode}
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
