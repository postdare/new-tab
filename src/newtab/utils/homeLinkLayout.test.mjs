import assert from "assert";
import {
  computeDefaultLayout,
  computeAnchoredDefaultLayout,
  estimateSize,
  fitAllPositions,
  fromAnchoredPositions,
  getLayoutAnchor,
} from "./homeLinkLayout.js";

const groups = ["one", "two", "three"].map((timeKey) => ({
  timeKey,
  links: [{ timeKey: `${timeKey}-link` }],
}));

const wide = computeDefaultLayout(groups, true, true, {
  width: 1200,
  height: 900,
});
assert.equal(wide.columnCount, 3);
assert.equal(wide.overflow, false);
assert.deepEqual(Object.keys(wide.positions), ["one", "two", "three"]);

const twoColumns = computeDefaultLayout(groups, true, true, {
  width: 240,
  height: 900,
});
assert.equal(twoColumns.columnCount, 2);
assert.equal(twoColumns.overflow, false);

const oneColumn = computeDefaultLayout(groups, true, true, {
  width: 210,
  height: 900,
});
assert.equal(oneColumn.columnCount, 1);
assert.equal(oneColumn.overflow, false);

const cardSize = estimateSize(1, true);
const oneColumnRects = Object.values(oneColumn.positions).map((position) => ({
  left: position.left,
  right: position.left + cardSize.w,
  top: position.top,
  bottom: position.top + cardSize.h,
}));
for (let index = 1; index < oneColumnRects.length; index += 1) {
  assert.ok(oneColumnRects[index].top >= oneColumnRects[index - 1].bottom);
}

const crowdedGroups = Array.from({ length: 6 }, (_, index) => ({
  timeKey: `crowded-${index}`,
  links: Array.from({ length: 35 }, (__, linkIndex) => ({
    timeKey: `crowded-${index}-${linkIndex}`,
  })),
}));
const crowded = computeDefaultLayout(crowdedGroups, true, false, {
  width: 1200,
  height: 800,
});
assert.equal(crowded.columnCount, 3);
assert.equal(crowded.overflow, true);

const fitted = fitAllPositions(
  {
    one: { left: 100, top: 260 },
    two: { left: 280, top: 430 },
  },
  groups.slice(0, 2),
  true,
  { width: 520, height: 520 }
);
assert.equal(fitted.changed, true);
assert.equal(fitted.overflow, false);
assert.equal(
  fitted.next.two.top - fitted.next.one.top,
  170,
  "视口收缩后应保留分组之间的相对距离"
);
assert.equal(
  fitted.next.two.left - fitted.next.one.left,
  180,
  "视口收缩后不应分别压缩横向坐标"
);

const devtoolsViewport = { width: 1200, height: 600 };
const devtoolsAnchor = getLayoutAnchor(false, devtoolsViewport);
const devtoolsAbsolute = fromAnchoredPositions(
  {
    one: { left: -300, top: 0 },
    two: { left: 100, top: 500 },
  },
  false,
  devtoolsViewport
);
const devtoolsFitted = fitAllPositions(
  devtoolsAbsolute,
  groups.slice(0, 2),
  true,
  devtoolsViewport,
  { fitVertical: false }
);
assert.equal(
  devtoolsFitted.next.one.top,
  devtoolsAnchor.top,
  "F12 缩短视口后不应把书签簇顶到搜索框上方"
);

const anchored = computeAnchoredDefaultLayout(groups, true, false, {
  width: 1440,
  height: 900,
});
const internalDisplay = fromAnchoredPositions(
  anchored.positions,
  false,
  { width: 1440, height: 900 }
);
const externalDisplay = fromAnchoredPositions(
  anchored.positions,
  false,
  { width: 2560, height: 1440 }
);
assert.deepEqual(
  Object.keys(internalDisplay),
  Object.keys(externalDisplay)
);
assert.equal(
  internalDisplay.two.left - internalDisplay.one.left,
  externalDisplay.two.left - externalDisplay.one.left,
  "切换显示器后分组的横向结构应保持不变"
);
assert.equal(
  internalDisplay.two.top - internalDisplay.one.top,
  externalDisplay.two.top - externalDisplay.one.top,
  "切换显示器后分组的纵向结构应保持不变"
);
