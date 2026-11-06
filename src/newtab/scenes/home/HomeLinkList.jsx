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
import Frost from "~/components/Frost";
import StickledLayer from "~/components/StickledLayer";
import useLiveViewportSize from "~/hooks/useLiveViewportSize";
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
  snap,
  toPlainPositions,
} from "~/utils/homeLinkLayout";

const HomeLinkOuter = styled(StickledLayer)`
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
  --frost-tint: var(--homeNavBg);
  position: relative;
  width: fit-content;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--homeNavBorderColor);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
    .home-link-drag-grip {
      opacity: 0.85;
    }
  }

  &.dragging {
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    .home-link-drag-grip {
      opacity: 1;
    }
  }
`;

/* 标题行：标题居左、拖拽手柄居右。listeners 挂在整行上而不是只挂隐形图标，
   手柄淡出后仍能从标题处起拖，不会因为看不见就没法拖 */
const DragHandleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 16px;
  margin: -4px 0 6px;
  padding: 2px 0 4px;
  cursor: grab;
  touch-action: none;
  &:active {
    cursor: grabbing;
  }
`;

/* 手柄默认隐形，hover 整卡才淡入（拖拽中保持全亮）。
   用 margin-left: auto 贴右端，这样「显示分组名称」关闭、行里只剩图标时
   它依然靠右，也不会因为标题的 flex:1 而丢失右对齐 */
const DragGrip = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: auto;
  color: var(--textColor);
  opacity: 0;
  transition: opacity 0.2s;
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
  const showTitle = showGroupTitle && title;
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
        <DragHandleRow {...listeners} title="拖动调整位置">
          {showTitle ? <GroupTitle title={title}>{title}</GroupTitle> : null}
          <DragGrip className="home-link-drag-grip">
            <IconGripHorizontal size={14} stroke={1.6} />
          </DragGrip>
        </DragHandleRow>
        <ReactSortable
          tag={SortableWrapper}
          list={linkList}
          setList={handleSort}
          animation={150}
          ghostClass="home-link-ghost"
          disabled={isDragging}
        >
          {linkList.map((v) => {
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

const HomeLinkListComponent = (props) => {
  const {
    homeGroups,
    allTimeKeys = [],
    isSoBarDown,
    stickled,
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
  // 两屏 pane 共享一份 homeLinkPositions。坐标表的生命线是「仍在上屏的分组全集」
  // (本屏 + 另一屏),而不是本屏自己的分组——否则本屏挂载时的 prune 会把
  // 另一屏分组的坐标剪掉(移屏后另一 pane 读不到,分组被当新分组重排丢位置)。
  const allKeysSig = (Array.isArray(allTimeKeys) ? allTimeKeys : []).join(",");

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

    // 只剪真正不再上屏的死键(全集 = 两屏分组之和);另一屏分组的位置必须保留
    const keepSet = new Set([
      ...validGroups.map((g) => g.timeKey),
      ...(Array.isArray(allTimeKeys) ? allTimeKeys : []),
    ]);
    const pruned = {};
    Object.keys(fromStore).forEach((k) => {
      if (keepSet.has(k)) pruned[k] = fromStore[k];
    });

    // 排布只看本屏。另一屏的坐标同在这张表里,但它们画在另一块画布上:
    // 既不该让「本屏是不是空的」判成非空(空屏该走默认瀑布流,不是贴着
    // 另一屏的簇往右排),也不该被当成要避让的邻居。
    const ownPositions = {};
    validGroups.forEach((g) => {
      if (pruned[g.timeKey]) ownPositions[g.timeKey] = pruned[g.timeKey];
    });
    const missing = validGroups.filter((g) => !ownPositions[g.timeKey]);

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
    if (Object.keys(ownPositions).length === 0) {
      additions = computeAnchoredDefaultLayout(
        missing,
        showGroupTitle,
        isSoBarDown,
        viewport
      ).positions;
    } else {
      additions = placeNewGroups(missing, ownPositions);
    }

    persistPositions({ ...pruned, ...additions });
  }, [
    validKeySig,
    allKeysSig,
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
