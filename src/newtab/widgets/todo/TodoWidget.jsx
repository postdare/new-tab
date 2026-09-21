import React from "react";
import styled from "styled-components";
import { observer } from "mobx-react";
import { useMemoizedFn } from "ahooks";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { getID } from "~/utils";
import useStores from "~/hooks/useStores";
import { todoMarkdown } from "./markdown";
import WidgetCard, { scheme } from "../WidgetCard";
import { useWidgetData } from "../storage";
import { widgetSize, WIDGET_METRICS as M } from "../sizes";

/* 列表行的尺度。从 M 推导而不是写死，改了全局 SCALE 这里跟着走 */
const ROW_H = 18;
const ROW_GAP = 3;
const INPUT_H = 22;
const TOP_GAP = 8;
const BOX = 13;

/* 列表字号:本地调大一档。全局 metaFontSize 经 SCALE 后落到 10px，待办这种
   「一行一项」的卡片上太挤了,这里单独覆盖,只影响 todo 卡本身 */
const META_FONT_SIZE = 13;

/** 一档能放下几行：按卡片实际高度算，加尺寸档时不用回来改数字 */
function listCapacity(size) {
  const box = widgetSize(size);
  const body =
    box.height -
    M.padding * 2 -
    M.headFontSize -
    TOP_GAP -
    INPUT_H -
    M.metaGap;
  return Math.max(1, Math.floor((body + ROW_GAP) / (ROW_H + ROW_GAP)));
}

/* 完成态底色:暖黄纸卡上用「深一档的黄」做勾选底,比黑底柔和也立得住 */
const DONE_FILL = "#d4a017";

const List = styled.div`
  margin-top: ${TOP_GAP}px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${ROW_GAP}px;
  min-height: 0;
  ${(props) =>
    props.$expanded
      ? `
  flex: none;
  max-height: ${props.$max}px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: ${props.$scheme.border} transparent;
  padding-right: 2px;
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background: ${props.$scheme.border};
  }
  &::-webkit-scrollbar-thumb:hover {
    background: ${props.$scheme.text};
    opacity: 0.4;
  }
  `
      : ""}
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: ${ROW_H}px;
  font-size: ${META_FONT_SIZE}px;
  line-height: 1.3;

  &:hover .todo-remove {
    opacity: 0.5;
  }
`;

const Box = styled.button`
  flex: none;
  width: ${BOX}px;
  height: ${BOX}px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid
    ${(props) => (props.$done ? DONE_FILL : props.$scheme.border)};
  background: ${(props) =>
    props.$done ? DONE_FILL : "transparent"};
  color: ${(props) => props.$scheme.text};
  cursor: pointer;
`;

const Text = styled.span`
  flex: 1;
  min-width: 0;
  /* 装不下的英文/中文混排整行折到下一行,而不被单行省略号喀掉一半 */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
  opacity: ${(props) => (props.$done ? 0.45 : 0.9)};
  text-decoration: ${(props) => (props.$done ? "line-through" : "none")};
`;

/* 行内编辑输入框:贴着行高,不换行不撑破行 */
const Editor = styled.input`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px solid ${(props) => props.$scheme.border};
  background: none;
  color: inherit;
  font-size: inherit;
  line-height: 1;
  outline: none;
  caret-color: currentColor;
`;

/* 右上角复制按钮:悬停显现,与 QuotaWidget 的外链一致 */
const CopyBtn = styled.button`
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1 !important;
  }
`;

const Remove = styled.button`
  flex: none;
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1 !important;
  }
`;

const More = styled.button`
  height: ${ROW_H}px;
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-size: ${META_FONT_SIZE}px;
  opacity: 0.5;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
`;

/* 展开态:固定视口高度内滚动,看得到全部待办 */
const expandedCapacity = (size) => {
  const box = widgetSize(size);
  return Math.max(
    4,
    Math.floor((box.height * 0.6 + ROW_GAP) / (ROW_H + ROW_GAP))
  );
};

const Input = styled.input`
  margin-top: ${M.metaGap}px;
  height: ${INPUT_H}px;
  width: 100%;
  padding: 0;
  border: 0;
  border-top: 1px solid ${(props) => props.$scheme.border};
  background: none;
  color: inherit;
  font-size: ${META_FONT_SIZE}px;
  outline: none;

  &::placeholder {
    color: inherit;
    opacity: 0.45;
  }
`;

/* 小卡放不下清单，退化成「还剩几件」+ 最近两条，形态与额度卡一致 */
const Count = styled.div`
  margin-top: ${M.valueOffset}px;
  font-size: ${(props) => props.$size.valueFontSize}px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

const Peek = styled.div`
  margin-top: ${M.metaGap}px;
  font-size: ${META_FONT_SIZE}px;
  line-height: ${M.metaLineHeight};
  opacity: 0.78;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Spacer = styled.div`
  flex: 1;
`;

const EMPTY = { items: [] };

/** 卡片整体是拖拽把手，所以卡内每个可点的东西都要掐掉 pointerdown */
const stopDrag = (e) => e.stopPropagation();

/**
 * 待办清单。首屏组件里第一个「非 AI、要存自己的数据、要实例配置」的组件——
 * 它跑通了才说明这层是通用的。
 *
 * 数据在 widgetData.{instanceId}（走 db，随同步与导出），
 * 清单名在实例 config.title（每个实例一份）。
 */
const TodoWidget = observer((props) => {
  const { instance, definition, position } = props;
  const { tools } = useStores();
  const [data, setData] = useWidgetData(instance.id, EMPTY);
  const [draft, setDraft] = React.useState("");
  /* 行内编辑:一次只编一行,文本放 state 里好拿 */
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const palette = scheme(definition.scheme);
  const box = widgetSize(instance.size);

  const items = React.useMemo(() => {
    const list = Array.isArray(data?.items) ? data.items : [];
    // 已完成的排前面，未完成的排下面
    return [...list].sort((a, b) => Number(b.done) - Number(a.done));
  }, [data]);

  const undone = items.filter((item) => !item.done);

  const toggle = useMemoizedFn((id) => {
    setData((current) => ({
      ...current,
      items: (current.items || []).map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      ),
    }));
  });

  const remove = useMemoizedFn((id) => {
    setData((current) => ({
      ...current,
      items: (current.items || []).filter((item) => item.id !== id),
    }));
  });

  const add = useMemoizedFn(() => {
    const text = draft.trim();
    if (!text) return;
    setData((current) => ({
      ...current,
      items: [...(current.items || []), { id: getID(), text, done: false }],
    }));
    setDraft("");
  });

  const startEdit = useMemoizedFn((item) => {
    setEditingId(item.id);
    setEditText(item.text);
  });

  const saveEdit = useMemoizedFn((id) => {
    setEditingId(null);
    const text = editText.trim();
    if (!text) {
      // 内容被清空 → 删掉这条待办
      remove(id);
      return;
    }
    setData((current) => ({
      ...current,
      items: (current.items || []).map((item) =>
        item.id === id ? { ...item, text } : item
      ),
    }));
  });

  const cancelEdit = useMemoizedFn(() => setEditingId(null));

  const copy = useMemoizedFn(() => {
    // 复制的是屏幕上的顺序(已完成的在前)
    navigator.clipboard
      ?.writeText(todoMarkdown(items))
      .then(() => tools.success("已复制到剪贴板"))
      .catch(() => {});
  });

  if (instance.size === "small") {
    const peek = undone.slice(0, 2);
    return (
      <WidgetCard instance={instance} definition={definition} position={position}>
        <Count $size={box}>{undone.length}</Count>
        <Spacer />
        {peek.length > 0 ? (
          peek.map((item) => <Peek key={item.id}>{item.text}</Peek>)
        ) : (
          <Peek>全部完成</Peek>
        )}
      </WidgetCard>
    );
  }

  const capacity = listCapacity(instance.size);
  const overflow = items.length > capacity;
  const visible = !overflow || expanded ? items : items.slice(0, capacity - 1);
  const maxH =
    expandedCapacity(instance.size) * (ROW_H + ROW_GAP) - ROW_GAP +
    (overflow ? ROW_H + ROW_GAP : 0);

  return (
    <WidgetCard
      instance={instance}
      definition={definition}
      position={position}
      action={
        <CopyBtn
          className="widget-head-action"
          type="button"
          title="复制为 Markdown"
          onPointerDown={stopDrag}
          onClick={copy}
        >
          <IconCopy size={13} stroke={1.8} />
        </CopyBtn>
      }
    >
      <List $expanded={expanded} $max={maxH} $scheme={palette}>
        {visible.map((item) => (
          <Row key={item.id}>
            <Box
              type="button"
              $scheme={palette}
              $done={item.done}
              title={item.done ? "标记为未完成" : "标记为完成"}
              onPointerDown={stopDrag}
              onClick={() => toggle(item.id)}
            >
              {item.done ? <IconCheck size={9} stroke={3} /> : null}
            </Box>
            {item.id === editingId ? (
              <Editor
                $scheme={palette}
                autoFocus
                value={editText}
                onPointerDown={stopDrag}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => saveEdit(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEdit();
                  else if (e.key === "Enter") saveEdit(item.id);
                }}
              />
            ) : (
              <Text
                $done={item.done}
                title="点击编辑"
                onPointerDown={stopDrag}
                onClick={() => startEdit(item)}
              >
                {item.text}
              </Text>
            )}
            <Remove
              className="todo-remove"
              type="button"
              title="删除"
              onPointerDown={stopDrag}
              onClick={() => remove(item.id)}
            >
              <IconX size={11} stroke={2} />
            </Remove>
          </Row>
        ))}
        {overflow ? (
          <More
            type="button"
            title={expanded ? "收起" : "查看全部"}
            onPointerDown={stopDrag}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "收起"
              : `还有 ${items.length - visible.length} 项`}
          </More>
        ) : null}
        {items.length === 0 ? <More>还没有待办</More> : null}
      </List>
      <Input
        $scheme={palette}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder="添加一项…"
        onPointerDown={stopDrag}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          /* IME 选词中的回车(commit 当前候选),不要顺便当成「确认添加」 */
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            e.keyCode !== 229
          ) {
            add();
          }
        }}
      />
    </WidgetCard>
  );
});

export default TodoWidget;
