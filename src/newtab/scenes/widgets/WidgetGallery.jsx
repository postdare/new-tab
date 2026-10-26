import React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import { IconPlus, IconMinus, IconSettings, IconArrowBackUp, IconArrowsExchange } from "@tabler/icons-react";
import useStores from "~/hooks/useStores";
import { WIDGETS } from "~/widgets/registry";
import {
  WIDGETS_KEY,
  addInstance,
  listInstancesWithDedup,
  updateInstance,
  updateInstanceConfig,
  removeInstance,
} from "~/widgets/instances";
import { galleryCards, groupCards, applyDedupe } from "~/widgets/galleryModel";
import { placeNewWidget } from "~/widgets/layout";
import { dropWidgetData } from "~/widgets/storage";
import WidgetPreview from "~/widgets/WidgetPreview";
import SettingsForm from "~/widgets/SettingsForm";
import { SIZE_LABELS, WIDGET_METRICS, orderedSizes, widgetSize } from "~/widgets/sizes";
import { BLOCK_MIN, GALLERY, PREVIEW_BOX } from "~/widgets/galleryLayout";

const Warp = styled.section`
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 28px 80px;
  box-sizing: border-box;
  /* 撑满滚动容器高:内容矮时页脚也能钉在可视区底部(Footer 的 margin-top:auto 吃掉空隙) */
  min-height: 100%;
  display: flex;
  flex-direction: column;

  @media (max-width: 1100px) {
    padding: 20px 20px 64px;
  }
`;

const PageTitle = styled.h1`
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
`;

/* 一句话说明「挑档位、加首屏」:尺寸在组件库里换,
   真正像 Mac 桌面那样随手摆是首屏的事(见首屏拖拽),不是这页。 */
const PageDesc = styled.div`
  font-size: 12px;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
  line-height: 1.6;
`;

/* 按 group 分段(分组在模型层做好,这里只渲染):段与段之间 32px */
const Sections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${GALLERY.sectionGap}px;
  margin-top: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: ${GALLERY.sectionTitleFontSize}px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
`;

/* 行内紧凑填充:块宽随预览内容走,一行从左到右塞满才换行,不再把页面切成
   等宽列、让小块周围留出大片空白。行内顺序即阅读顺序;行尾放不下就换行。
   行首左对齐:最后一行卡片少时也从左边排起,不会被居中推离左侧。 */
const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: flex-start;
  gap: ${GALLERY.cardGap}px ${GALLERY.columnGap}px;
  margin-top: 12px;
`;

/* 每个组件一块(栅格直接收 Front/Back 作子项,块就是行内一个条目)。
   这页的「块」没有边框、底色、圆角,只有组件缩略图 + 文字,直接浮在页面上。
   正面块宽 = 预览槽位宽,背面固定 BLOCK_MIN(设置表单需要稳定可读的宽度)。 */
const Face = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
`;

/* 背面返回钮的锚点:贴设置面右上角,常驻 */
const Corner = styled.div`
  position: absolute;
  top: -6px;
  right: -6px;
  display: flex;
  gap: 6px;
  z-index: 1;
`;

const Front = styled(Face)`
  /* 正面块宽 = 统一槽位宽:每张卡同宽,标题、档位行、操作行才排得齐 */
  width: ${PREVIEW_BOX.width}px;
  text-align: center;
`;

const Back = styled(Face)`
  /* 设置表单需要稳定的可读宽度,固定用 BLOCK_MIN(大档预览 + 两侧留白) */
  width: ${BLOCK_MIN}px;
  align-items: stretch;
  text-align: left;
`;

/* 小圆钮:透明底 + 当前文字色,深浅主题都立得住。
   hover 反色(黑底白字 / 白底深字)。 */
const Round = styled.button`
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--colorText, #333) 30%, transparent);
  background: color-mix(in srgb, var(--colorText, #333) 10%, transparent);
  color: var(--colorText, #333);
  cursor: pointer;
  opacity: ${(props) => (props.$attention ? 1 : 0.75)};
  border-color: ${(props) =>
    props.$attention
      ? "var(--colorText, #333)"
      : "color-mix(in srgb, var(--colorText, #333) 30%, transparent)"};
  transition:
    opacity 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 1;
    background: var(--colorText, #333);
    color: var(--workspaceBackdrop, #fff);
  }

  &:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
`;

/* 预览槽位:所有档位都占同一块固定尺寸,预览在槽内居中。
   超出槽位的档位由内层按比例缩到放得下,槽位本身不随档位变,
   所以每张卡等高、下面几行自然横向对齐。 */
const Tile = styled.div`
  width: ${PREVIEW_BOX.width}px;
  height: ${PREVIEW_BOX.height}px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: ${GALLERY.previewMarginTop}px 0 ${GALLERY.previewMarginBottom}px;
  transition: transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

/* 真实档位盒按原尺寸渲染,只有比槽位大时才 scale 下来(小卡保持原大小、不放大)。
   transform 不参与布局,占位由外层固定槽位兜住,不会按原始尺寸撑开或裁切圆角。 */
const PreviewFit = styled.div`
  display: flex;
  border-radius: ${WIDGET_METRICS.radius}px;
  transform: scale(${(props) => props.$scale});
  transform-origin: center center;
  /* 已添加的缩略图常驻一圈淡描边(低透明度 currentColor,深浅主题都看得见),
     不看 hover 也能认出哪张已经加过 */
  box-shadow: ${(props) =>
    props.$added
      ? "0 0 0 1px color-mix(in srgb, var(--colorText, #333) 22%, transparent)"
      : "none"};
`;

const Title = styled.div`
  font-size: ${GALLERY.titleFontSize}px;
  font-weight: 600;
  line-height: ${GALLERY.titleLineHeight};
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

/* 已添加状态:标题下、档位行上,11px muted;未添加不显示文字,
   但这一行的高度照占,已添加/未添加的档位行与操作行才对得齐 */
const StatusRow = styled.div`
  margin-top: ${GALLERY.addedMarginTop}px;
  min-height: ${GALLERY.statusRowHeight}px;
  font-size: ${GALLERY.addedFontSize}px;
  line-height: 1.4;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
`;

/* 尺寸档不用 Segmented:白底方块组在这里太重,
   降成一排文字,选中的实一点就够了。单档组件没有按钮,但行高照占。 */
const Sizes = styled.div`
  margin-top: ${GALLERY.sizesMarginTop}px;
  min-height: ${GALLERY.sizesRowHeight}px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
`;

const SizeBtn = styled.button`
  padding: 0;
  border: 0;
  background: none;
  font-size: ${GALLERY.sizeBtnFontSize}px;
  line-height: 1;
  cursor: pointer;
  color: var(--colorText, #333);
  opacity: ${(props) => (props.$active ? 1 : 0.35)};
  font-weight: ${(props) => (props.$active ? 600 : 400)};
  transition: opacity 0.2s ease;

  &:hover {
    opacity: ${(props) => (props.$active ? 1 : 0.7)};
  }
`;

/* 常驻操作行:添加/设置/换屏/移除都在这里,不再藏进 hover 才出现的角标。
   整行弱化到 0.6,hover / 聚焦时提亮;触屏没有 hover,直接常驻完整不透明度。 */
const ActionRow = styled.div`
  margin-top: 4px;
  min-height: ${GALLERY.actionRowHeight}px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: ${GALLERY.actionGap}px;
  opacity: ${GALLERY.actionOpacity};
  transition: opacity 0.15s ease;

  &:hover,
  &:focus-within {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
`;

/* 小文字按钮:图标 + 11px 文案;缺密钥等前置条件用 $attention 提亮,
   在整行弱化之下也看得见 */
const ActionBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  font-size: ${GALLERY.actionFontSize}px;
  line-height: 1.4;
  color: ${(props) =>
    props.$attention
      ? "var(--colorText, #333)"
      : "var(--workspaceMuted, rgba(28, 25, 23, 0.48))"};
  background: ${(props) =>
    props.$attention ? "color-mix(in srgb, var(--colorText, #333) 10%, transparent)" : "none"};
  font-weight: ${(props) => (props.$attention ? 600 : 400)};
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--colorText, #333);
    background: color-mix(in srgb, var(--colorText, #333) 8%, transparent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const BackTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
  padding-right: 28px;
`;

/* 背面同时有类型设置(如密钥)和此卡设置(如清单名)时,用小标题分开 */
const BackLabel = styled.div`
  font-size: 11px;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
  margin: 12px 0 6px;

  & + * {
    margin-top: 0;
  }
`;

const Empty = styled.div`
  font-size: 12px;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
`;

/* 底部说明:整页最底、居中。卡片变多页面变高时它自然跟到内容末尾 */
const Footer = styled.div`
  margin-top: auto;
  padding-top: 32px;
  font-size: 11px;
  text-align: center;
  color: var(--workspaceMuted, rgba(28, 25, 23, 0.48));
  line-height: 1.6;
`;

/** 一块组件:正面是固定槽位预览 + 标题/状态/档位/常驻操作行,点设置换成设置内容;
 *  背面右上角的返回钮常驻。块高由槽位与固定行高撑开,所有卡一致。 */
const GalleryCard = (props) => {
  const {
    card,
    size,
    onResize,
    onAdd,
    onRemove,
    onSaveSetting,
    onClearSetting,
    onSaveConfig,
    onClearConfig,
    onMoveScreen,
  } = props;
  const {
    definition,
    instance,
    added,
    canAdd,
    addReason,
    attention,
    settingsSchema,
    configSchema,
    settingsValues,
    configValues,
  } = card;
  const [flipped, setFlipped] = React.useState(false);
  const canFlip = !!(settingsSchema || configSchema);
  const title = added ? definition.instanceTitle?.(instance) || definition.title : definition.title;
  // 预览按真实档位盒渲染;超过槽位才按比例缩小,且永远不放大
  const box = widgetSize(size);
  const scale = Math.min(1, PREVIEW_BOX.width / box.width, PREVIEW_BOX.height / box.height);

  return flipped ? (
    <Back>
      <Corner>
        <Round type="button" title="返回" onClick={() => setFlipped(false)}>
          <IconArrowBackUp size={13} stroke={1.8} />
        </Round>
      </Corner>
      <BackTitle>{title}</BackTitle>
      {settingsSchema && configSchema ? <BackLabel>组件设置</BackLabel> : null}
      {settingsSchema ? (
        <SettingsForm
          schema={settingsSchema}
          values={settingsValues}
          onSave={onSaveSetting}
          onClear={onClearSetting}
        />
      ) : null}
      {settingsSchema && configSchema ? <BackLabel>此卡设置</BackLabel> : null}
      {configSchema ? (
        <SettingsForm
          schema={configSchema}
          values={configValues}
          onSave={onSaveConfig}
          onClear={onClearConfig}
        />
      ) : null}
    </Back>
  ) : (
    <Front>
      <Tile>
        <PreviewFit $scale={scale} $added={added}>
          <WidgetPreview definition={definition} size={size} dim={!added && !canAdd} />
        </PreviewFit>
      </Tile>
      <Title>{title}</Title>
      <StatusRow>{added ? (instance.screen ? "已在副屏" : "已在首屏") : null}</StatusRow>
      <Sizes>
        {definition.sizes.length > 1
          ? orderedSizes(definition.sizes).map((one) => (
              <SizeBtn
                key={one}
                type="button"
                $active={one === size}
                onClick={() => onResize(one)}
              >
                {SIZE_LABELS[one]}
              </SizeBtn>
            ))
          : null}
      </Sizes>
      <ActionRow>
        {canFlip ? (
          <ActionBtn
            type="button"
            $attention={attention}
            title="设置"
            onClick={() => setFlipped(true)}
          >
            <IconSettings size={12} stroke={1.8} />
            设置
          </ActionBtn>
        ) : null}
        {added ? (
          <>
            <ActionBtn type="button" onClick={onMoveScreen}>
              <IconArrowsExchange size={12} stroke={1.8} />
              {instance.screen ? "移到首屏" : "移到副屏"}
            </ActionBtn>
            <ActionBtn type="button" onClick={onRemove}>
              <IconMinus size={12} stroke={2} />
              移除
            </ActionBtn>
          </>
        ) : (
          <ActionBtn type="button" title={addReason} disabled={!canAdd} onClick={onAdd}>
            <IconPlus size={12} stroke={2} />
            添加到首屏
          </ActionBtn>
        )}
      </ActionRow>
    </Front>
  );
};

/**
 * 小组件页:行内紧凑填充,每种组件恰好一块(模型见 galleryModel)。
 * 这一页对组件种类是无知的:缩略图、可用性、设置表单全部走注册表字段,
 * 以后加待办、天气之类的组件都不需要再动这里。
 */
const WidgetGallery = () => {
  const { option, tools } = useStores();
  const item = option.item;
  // 读出即去重:存储里留着的重复实例在这里被挡住,视图永远每种类型至多一块
  const dedup = listInstancesWithDedup(item);
  const instances = dedup.instances;
  const cards = galleryCards(WIDGETS, instances, item);
  // 分组在模型层:段顺序 = group 首次出现的顺序,段内保持定义顺序
  const sections = groupCards(cards);

  // 尚未添加的块在组件库里选中的档位;没选过就用定义里的第一档
  const [picked, setPicked] = React.useState({});

  const save = (next) =>
    option.setItem(WIDGETS_KEY, next, false).catch((err) => {
      console.error(`[${WIDGETS_KEY}] save failed:`, err);
    });

  // 打开本页时把去重结果落一次盘,被丢实例的数据行(待办条目等)一起清掉;
  // 无重复时 applyDedupe 是 no-op,读写都不发生
  React.useEffect(() => {
    applyDedupe(option, listInstancesWithDedup(option.item)).catch((err) => {
      console.error(`[${WIDGETS_KEY}] dedupe failed:`, err);
    });
  }, [option, item]);

  const add = (card) => {
    const type = card.definition.type;
    const size = picked[type] || card.definition.sizes[0];
    save(addInstance(instances, card.definition, size, placeNewWidget(instances, size)));
  };

  // 已添加的实例在两屏间移动(新添加默认在首屏,想放副屏就先加再移)
  const moveToOtherScreen = (card) => {
    const nextScreen = card.instance.screen ? 0 : 1;
    save(updateInstance(instances, card.instance.id, { screen: nextScreen }));
    tools.success(`已移到${nextScreen === 1 ? "副屏" : "首屏"}`);
  };

  const drop = async (card) => {
    const id = card.instance.id;
    await save(removeInstance(instances, id));
    // 实例没了,它的数据行也不该留在库里和导出文件里
    await dropWidgetData(option, id);
  };

  return (
    <Warp className="widget-workspace">
      <PageTitle>小组件</PageTitle>
      <PageDesc>挑尺寸档位加到首屏，可像 Mac 桌面一样随意拖动摆放。</PageDesc>

      <Sections>
        {sections.map((section) => (
          <Section key={section.group}>
            <SectionTitle>{section.group}</SectionTitle>
            <Grid>
              {section.cards.map((card) => {
                const { definition, instance, added } = card;
                const size = added ? instance.size : picked[definition.type] || definition.sizes[0];
                return (
                  <GalleryCard
                    key={definition.type}
                    card={card}
                    size={size}
                    onResize={(next) =>
                      added
                        ? save(updateInstance(instances, instance.id, { size: next }))
                        : setPicked({ ...picked, [definition.type]: next })
                    }
                    onAdd={() => add(card)}
                    onRemove={() => drop(card)}
                    onMoveScreen={() => moveToOtherScreen(card)}
                    onSaveSetting={(key, value) => option.setItem(key, value)}
                    onClearSetting={(key) => option.setItem(key, "")}
                    onSaveConfig={(key, value) =>
                      save(updateInstanceConfig(instances, instance.id, key, value))
                    }
                    onClearConfig={(key) =>
                      save(updateInstanceConfig(instances, instance.id, key, ""))
                    }
                  />
                );
              })}
            </Grid>
          </Section>
        ))}
      </Sections>
      {WIDGETS.length === 0 ? <Empty>还没有可用的组件。</Empty> : null}

      <Footer>
        密钥只保存在本机，不参与 WebDAV / Gist 同步，也不会出现在导出的数据文件里；
        换设备需要重新填写。
      </Footer>
    </Warp>
  );
};

export default observer(WidgetGallery);
