/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, Guild } from "@vencord/discord-types";
import { Avatar, ChannelRouter, ChannelStore, GuildStore, IconUtils, Menu, NavigationRouter, React, SelectedChannelStore, UserStore, useStateFromStores } from "@webpack/common";

const DATASTORE_KEY = "ChatTabs:SavedTabs";
const cl = classNameFactory("vc-chat-tabs-");

interface Tab {
    id: string;
    channelId: string;
    title: string;
    guildId?: string;
    channelType?: number;
}

interface SavedTabState {
    tabs: Tab[];
    activeTabId: string | null;
}

const globalTabs: Tab[] = [];
let globalActiveTabId: string | null = null;

let navguardBypasserId: string | null = null;

const tabListeners = new Set<() => void>();
function notifyListeners() {
    tabListeners.forEach(l => l());
    if (settings.store.persistTabs) scheduleSave();
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
    if (saveTimeout != null) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        DataStore.set(DATASTORE_KEY, { tabs: globalTabs, activeTabId: globalActiveTabId, });
    }, 1000);
}

function useTabState() {
    const [tabs, setTabs] = React.useState<Tab[]>(globalTabs);
    const [activeTabId, setActiveTabId] = React.useState<string | null>(globalActiveTabId);

    React.useEffect(() => {
        const listener = () => {
            setTabs([...globalTabs]);
            setActiveTabId(globalActiveTabId);
        };

        tabListeners.add(listener);
        return () => { tabListeners.delete(listener); };
    }, []);

    return { tabs, activeTabId };
}

function addTab(channelId: string, title: string, guildId?: string) {
    const existing = globalTabs.find(t => t.channelId === channelId);
    if (existing) { globalActiveTabId = existing.id; notifyListeners(); return; }

    const channel = ChannelStore.getChannel(channelId);
    globalTabs.push({
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channelId,
        title,
        guildId,
        channelType: channel.type
    });

    globalActiveTabId = globalTabs[globalTabs.length - 1].id;
    notifyListeners();
}

function removeTab(tabId: string) {
    const index = globalTabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    globalTabs.splice(index, 1);
    let toSwitchTo: Tab | null = null;

    if (globalActiveTabId === tabId && globalTabs.length > 0)
        toSwitchTo = (globalTabs[Math.min(index, globalTabs.length - 1)]);

    else if (globalTabs.length === 0)
        toSwitchTo = null;

    if (globalActiveTabId === tabId) switchToTab(toSwitchTo);
    else notifyListeners();
}

function switchToTab(tab: Tab | null) {
    globalActiveTabId = tab?.id ?? null;

    if (tab) ChannelRouter.transitionToChannel(tab.channelId);
    else NavigationRouter.transitionToGuild("@me");

    notifyListeners();
}

function getChannelIconUrl(channel: Channel) {
    if (channel.isDM()) return IconUtils.getUserAvatarURL(UserStore.getUser(channel.recipients[0]));
    if (channel.isGroupDM()) return IconUtils.getChannelIconURL(channel);
    return IconUtils.getGuildIconURL(GuildStore.getGuild(channel.guild_id) as Guild);
}

function TabComponent({ tab, isActive }: { tab: Tab; isActive: boolean; }) {
    const iconUrl = getChannelIconUrl(ChannelStore.getChannel(tab.channelId));

    return (
        <div
            className={classes(cl("tab"), isActive && cl("active"))}
            onClick={() => switchToTab(tab)}
        >
            {iconUrl && (
                <Avatar
                    size="SIZE_16"
                    src={iconUrl}
                    className={cl("icon")}
                />
            )}

            <span className={cl("prefix")}>
                {tab.channelType === 2 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
                        <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="m10.86,5.88l4.91,0l1.28,-5.8l2.99,0l-1.28,5.8l5.1,0l-0.78,3.29l-5.04,0l-1.25,5.66l5.11,0l-0.78,3.29l-5.05,0l-1.28,5.8l-2.99,0l1.28,-5.8l-4.91,0l-1.28,5.8l-2.99,0l1.28,-5.8l-5.1,0l0.78,-3.29l5.04,0l1.25,-5.66l-5.11,0l0.78,-3.29l5.05,0l1.28,-5.8l2.99,0l-1.28,5.8zm-1.97,8.94l4.91,0l1.25,-5.66l-4.91,0l-1.25,5.66z" />
                    </svg>
                )}
            </span>

            <span className={cl("title")}>{tab.title}</span>

            <button
                className={cl("close")}
                onClick={e => { e.stopPropagation(); removeTab(tab.id); }}
            >
                ⨯
            </button>
        </div>
    );
}

function TabBar() {
    const { tabs, activeTabId } = useTabState();
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        let resizeObserver: ResizeObserver | null = null;
        let rafId: number | null = null;

        const setupMargins = () => {
            const tabsEl = containerRef.current;
            if (!tabsEl) { rafId = requestAnimationFrame(setupMargins); return; }

            const title = tabsEl.parentElement as HTMLElement;
            const header = title?.parentElement as HTMLElement;
            if (!title || !header) { rafId = requestAnimationFrame(setupMargins); return; }

            const siblings = [...header.children];
            const idx = siblings.indexOf(title);

            const leading = siblings[idx - 1] as HTMLElement;
            const trailing = siblings[idx + 1] as HTMLElement;
            if (!leading || !trailing) { rafId = requestAnimationFrame(setupMargins); return; }

            const updateMargins = () => {
                const left = leading.getBoundingClientRect().right + 8;
                const right = header.getBoundingClientRect().right - trailing.getBoundingClientRect().left + 8;

                tabsEl.style.marginLeft = `${left}px`;
                tabsEl.style.marginRight = `${right}px`;
            };

            updateMargins();
            resizeObserver = new ResizeObserver(updateMargins);
            resizeObserver.observe(header);
            resizeObserver.observe(leading);
            resizeObserver.observe(trailing);
        };

        rafId = requestAnimationFrame(setupMargins);
        return () => {
            if (rafId != null) cancelAnimationFrame(rafId);
            resizeObserver?.disconnect();
        };
    }, []);

    const currentChannel = useStateFromStores(
        [ChannelStore, SelectedChannelStore],
        () => ChannelStore.getChannel(SelectedChannelStore.getChannelId()) as Channel | undefined
    );

    React.useEffect(() => {
        if (!currentChannel) return;

        if (!settings.store.openTabsOnNavigation && currentChannel.id !== navguardBypasserId) return;
        navguardBypasserId = null;

        let title = currentChannel.name;
        if (!title && currentChannel.isDM()) title = UserStore.getUser(currentChannel.getRecipientId()!)?.username;

        addTab(currentChannel.id, title, currentChannel.guild_id);

        requestAnimationFrame(() => {
            const tabsEl = containerRef.current;
            if (!tabsEl) return;

            const activeTabEl = tabsEl.querySelector(`.${cl("active")}`);
            if (!activeTabEl) return;

            const containerRect = tabsEl.getBoundingClientRect();
            const tabRect = activeTabEl.getBoundingClientRect();

            if (!(tabRect.right > containerRect.right || tabRect.left < containerRect.left)) return;

            tabsEl.scrollTo({
                left: tabsEl.scrollLeft + (tabRect.left - containerRect.left) - 10,
                behavior: "smooth"
            });
        });
    }, [currentChannel?.id]);

    return (
        <div
            ref={containerRef}
            className={cl("container")}
            onWheel={e => { e.preventDefault(); containerRef.current!.scrollLeft += e.deltaY; }}
        >
            {tabs.map(tab => (
                <TabComponent key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
            ))}
        </div>
    );
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, props) => {
    const channel = props?.channel;
    if (!channel) return;

    (findGroupChildrenByChildId("mark-channel-read", children) ?? children).push(
        <Menu.MenuItem
            id="vc-chat-tabs-open-in-new-tab"
            label="Open in New Tab"
            action={() => {
                navguardBypasserId = channel.id;
                ChannelRouter.transitionToChannel(channel.id);
            }}
        />
    );
};

export const settings = definePluginSettings({
    openTabsOnNavigation: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Open a new tab whenever you navigate to a channel"
    },
    persistTabs: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Restore tabs from previous session on startup"
    }
});

export default definePlugin({
    name: "ChatTabs",
    description: "Swaps out the useless Discord titlebar for browser-like horizontal tabs for your chats",
    authors: [{ name: "debxylen", id: 651824112942972964n }],
    tags: ["Organisation"],

    settings,

    contextMenus: {
        "channel-context": patchChannelContextMenu,
        "thread-context": patchChannelContextMenu,
        "user-context": patchChannelContextMenu,
        "gdm-context": patchChannelContextMenu,
    },

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(title:)\(0,\i\.jsx\)\(\i,\{\}\)/,
                replace: "$1$self.renderTitleTabs()"
            }
        }
    ],

    async start() {
        if (!settings.store.persistTabs) return;

        const saved = await DataStore.get<SavedTabState>(DATASTORE_KEY);
        if (!saved?.tabs.length) return;

        for (const tab of saved.tabs) {
            if (!ChannelStore.hasChannel(tab.channelId)) continue;

            globalTabs.push({
                id: tab.id,
                channelId: tab.channelId,
                title: tab.title,
                guildId: tab.guildId,
                channelType: tab.channelType
            });
        }

        const activeTab = globalTabs.find(t => t.id === saved.activeTabId) ?? null;
        switchToTab(activeTab);
    },

    renderTitleTabs() {
        return (
            <ErrorBoundary key={cl("errorbound")} noop>
                <TabBar />
            </ErrorBoundary>
        );
    },
});
