import React from "react";
import { observer } from "mobx-react";
import useStores from "~/hooks/useStores";
import { Button } from "antd";
import { IconGripVertical } from "@tabler/icons-react";
import styled from "styled-components";
import { ReactSortable } from "react-sortablejs";
import _ from "lodash";

const transformArrayToTree = (items, homeId) => {
    const itemMap = _.keyBy(items, 'timeKey');
    const result = [];

    items.forEach(item => {
        if (!itemMap[item.timeKey].children) {
            itemMap[item.timeKey].children = [];
        }
        if (item.parentId === homeId) {
            result.push(itemMap[item.timeKey]);
        } else if (itemMap[item.parentId]) {
            if (!itemMap[item.parentId].children) {
                itemMap[item.parentId].children = [];
            }
            itemMap[item.parentId].children.push(itemMap[item.timeKey]);
        }
    });

    const sortChildren = (node) => {
        if (node.children) {
            node.children.sort((a, b) => a.sort - b.sort);
            node.children.forEach(child => sortChildren(child));
        }
    };
    result.forEach(sortChildren);

    const transformItem = (item) => ({
        title: item.title,
        sort: item.sort,
        key: item.timeKey,
        id: item.linkId,
        children: item.children.map(child => transformItem(child))
    });

    return _.sortBy(result.map(item => transformItem(item)), 'sort');
};

const treeToArrayWithNewSort = (tree, parentId = null) => {
    let result = [];
    tree.forEach((node, index) => {
        result.push({ linkId: node.id, timeKey: node.key, parentId, sort: index });
        if (node.children?.length > 0) {
            result = result.concat(treeToArrayWithNewSort(node.children, node.key));
        }
    });
    return result;
};

const Root = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0;
    min-height: 260px;
`;

const Body = styled.div`
    display: flex;
    gap: 0;
    flex: 1;
    border: 1px solid #eaecf0;
    border-radius: 8px;
    overflow: hidden;
`;

const GroupCol = styled.div`
    width: 160px;
    flex-shrink: 0;
    border-right: 1px solid #eaecf0;
    display: flex;
    flex-direction: column;
`;

const ColHeader = styled.div`
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #9ea5b0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border-bottom: 1px solid #eaecf0;
    background: #fafbfc;
    user-select: none;
`;

const ColBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

const ItemCol = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
`;

const GroupItem = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    background: ${({ $active }) => $active ? '#eff6ff' : 'transparent'};
    border: 1px solid ${({ $active }) => $active ? '#bfdbfe' : 'transparent'};
    user-select: none;

    svg { color: ${({ $active }) => $active ? '#93c5fd' : '#d1d5db'}; flex-shrink: 0; }
    span {
        font-size: 13px;
        color: ${({ $active }) => $active ? '#1d4ed8' : '#374151'};
        font-weight: ${({ $active }) => $active ? 500 : 400};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
`;

const SubItem = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    margin: 2px 0;
    border-radius: 6px;
    background: #fff;
    border: 1px solid #eaecf0;
    cursor: grab;
    transition: box-shadow 0.15s, border-color 0.15s;
    user-select: none;

    &:active { cursor: grabbing; }
    &:hover {
        border-color: #c7d2de;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
    }
    svg { color: #d1d5db; flex-shrink: 0; }
    span {
        font-size: 13px;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
`;

const EmptyHint = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    color: #c4c9d4;
    font-size: 13px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    padding-top: 14px;
`;

const MoveGroup = () => {
    const { option, tools, link } = useStores();
    const [treeData, setTreeData] = React.useState([]);
    const [activeKey, setActiveKey] = React.useState(null);

    const onInit = React.useCallback(() => {
        option.getHomeId().then((homeId) => {
            const list = [];
            link.getLinkByParentId([homeId]).then((res) => {
                list.push(...res);
                link.getLinkByParentId(res.map((v) => v.timeKey)).then((v) => {
                    list.push(...v);
                    const tree = transformArrayToTree(list, homeId);
                    setTreeData(tree);
                    if (tree.length > 0) setActiveKey(tree[0].key);
                });
            });
        });
    }, []);

    const onSave = React.useCallback(() => {
        option.getHomeId().then((homeId) => {
            const updateList = treeToArrayWithNewSort(treeData, homeId);
            link.updateLink(updateList).then(() => {
                link.restart();
                tools.closePublicModal();
            });
        });
    }, [treeData]);

    React.useEffect(() => { onInit(); }, []);

    const activeIndex = treeData.findIndex(g => g.key === activeKey);
    const activeGroup = activeIndex >= 0 ? treeData[activeIndex] : null;

    return (
        <Root>
            <Body>
                <GroupCol>
                    <ColHeader>分组</ColHeader>
                    <ColBody>
                        <ReactSortable
                            animation={150}
                            group="group-list"
                            ghostClass="group-list-ghost"
                            list={treeData}
                            setList={setTreeData}
                        >
                            {treeData.map((item) => (
                                <GroupItem
                                    key={item.key}
                                    $active={item.key === activeKey}
                                    onClick={() => setActiveKey(item.key)}
                                >
                                    <IconGripVertical size={14} />
                                    <span>{item.title}</span>
                                </GroupItem>
                            ))}
                        </ReactSortable>
                    </ColBody>
                </GroupCol>

                <ItemCol>
                    <ColHeader>
                        {activeGroup ? `${activeGroup.title} · 子分组` : '子分组'}
                    </ColHeader>
                    <ColBody>
                        {activeGroup ? (
                            <ReactSortable
                                animation={150}
                                group="group-item"
                                ghostClass="group-item-ghost"
                                list={activeGroup.children}
                                setList={(value) => {
                                    setTreeData((old) => {
                                        const next = _.cloneDeep(old);
                                        next[activeIndex].children = value;
                                        return next;
                                    });
                                }}
                            >
                                {activeGroup.children.map((v) => (
                                    <SubItem key={v.key}>
                                        <IconGripVertical size={14} />
                                        <span>{v.title}</span>
                                    </SubItem>
                                ))}
                            </ReactSortable>
                        ) : (
                            <EmptyHint>请选择分组</EmptyHint>
                        )}
                    </ColBody>
                </ItemCol>
            </Body>

            <Footer>
                <Button type="primary" onClick={onSave}>保存</Button>
            </Footer>
        </Root>
    );
};

export default observer(MoveGroup);
