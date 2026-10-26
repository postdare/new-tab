import { toPlain } from "./plain";
import { WIDGETS_KEY } from "./instances";
import { checkAvailable, hasConfig, hasSettings, settingValue } from "./settings";
import { dropWidgetData } from "./storage";

/**
 * 管理页的统一列表模型:每种组件恰好一张卡,已添加/组件库不再分栏。
 * 「加过的组件在页面上出现两次」是分栏结构的必然结果,单列表从数据形状上消灭它;
 * 页面只消费这里,不再自己拼「已添加 + 组件库」两段。
 */
export function galleryCards(definitions, instances, item) {
  const byType = new Map();
  for (const instance of instances) {
    // 未知 type 的实例不崩也不出卡(listInstances 已过滤,这里兜底);同类型取最早一张
    if (!byType.has(instance.type)) byType.set(instance.type, instance);
  }
  return definitions.map((definition) => {
    const instance = byType.get(definition.type) || null;
    const availability = checkAvailable(definition, item);
    const added = !!instance;
    return {
      definition,
      instance,
      added,
      // 已添加(或缺前置条件)的卡没有添加动作;理由说明为什么
      canAdd: !added && availability.ok,
      addReason: added ? "已添加" : availability.ok ? "添加到首屏" : availability.reason,
      // 缺密钥一类前置条件:齿轮按钮加重提示,把人引去设置
      attention: !availability.ok,
      settingsSchema: hasSettings(definition) ? definition.settings : null,
      configSchema: added && hasConfig(definition) ? definition.configSchema : null,
      settingsValues: Object.fromEntries(
        (definition.settings || []).map((field) => [field.key, settingValue(field, item)])
      ),
      configValues: toPlain(instance?.config || {}),
    };
  });
}

/** 定义没写 group 时归到这一段,页面上不会出现空白标题 */
export const DEFAULT_GROUP = "其他";

/**
 * 按 group 分段:段顺序 = group 在定义里首次出现的顺序,段内保持传入顺序。
 * 分组只在模型层做,页面拿到的是现成的段,不自己聚合。
 */
export function groupCards(cards) {
  const sections = [];
  const byGroup = new Map();
  for (const card of cards) {
    const group = card.definition.group || DEFAULT_GROUP;
    let section = byGroup.get(group);
    if (!section) {
      section = { group, cards: [] };
      byGroup.set(group, section);
      sections.push(section);
    }
    section.cards.push(card);
  }
  return sections;
}

/**
 * 去重落地:没变化就什么都不做(读写都不发生);
 * 有变化写一次存储,被丢实例的数据行(待办条目等)一起清掉,
 * 不然它们会一直躺在库里和导出文件里。
 */
export async function applyDedupe(option, dedup) {
  if (!dedup.changed) return false;
  await option.setItem(WIDGETS_KEY, dedup.instances, false);
  for (const id of dedup.droppedIds) {
    await dropWidgetData(option, id);
  }
  return true;
}
