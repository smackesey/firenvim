import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]
import { getConf } from "../utils/configuration";
import { keysToEvents } from "../utils/keys";
import { FirenvimElement } from "../FirenvimElement";

interface IGlobalState {
    lastBufferInfo: [string, string, [number, number], string];
    nvimify: (evt: FocusEvent) => void;
    firenvimElems: Map<number, FirenvimElement>;
    registerNewFrameId: (frameId: number) => void;
    disabled: boolean | Promise<boolean>;
}

function _focusInput(global: IGlobalState, firenvim: FirenvimElement, addListener: boolean) {
    if (addListener) {
        // Only re-add event listener if input's selector matches the ones
        // that should be autonvimified
        const conf = getConf();
        if (conf.selector && conf.selector !== "") {
            const elems = Array.from(document.querySelectorAll(conf.selector));
            addListener = elems.includes(firenvim.getElement());
        }
    }
    firenvim.focusOriginalElement(addListener);
}

function getFocusedElement (firenvimElems: Map<number, FirenvimElement>) {
    return Array
        .from(firenvimElems.values())
        .find(instance => instance.isFocused());
}

export function getFunctions(global: IGlobalState) {
    return {
        focusInput: (frameId: number) => {
            let firenvimElement;
            if (frameId === undefined) {
                firenvimElement = getFocusedElement(global.firenvimElems);
            } else {
                firenvimElement = global.firenvimElems.get(frameId);
            }
            _focusInput(global, firenvimElement, true);
        },
        focusPage: () => {
            (document.activeElement as any).blur();
            document.documentElement.focus();
        },
        forceNvimify: () => {
            let elem = document.activeElement;
            if (!elem || elem === document.documentElement || elem === document.body) {
                function isVisible(e: HTMLElement) {
                    const rect = e.getBoundingClientRect();
                    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
                    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
                }
                elem = Array.from(document.getElementsByTagName("textarea"))
                    .find(isVisible);
                if (!elem) {
                    elem = Array.from(document.getElementsByTagName("input"))
                        .find(e => e.type === "text" && isVisible(e));
                }
                if (!elem) {
                    return;
                }
            }
            global.nvimify({ target: elem } as any);
        },
        getActiveInstanceCount : () => global.firenvimElems.size,
        getEditorInfo: () => {
            return global.lastBufferInfo;
        },
        getElementContent: (frameId: number) => global
            .firenvimElems
            .get(frameId)
            .getPageElementContent(),
        hideEditor: (frameId: number) => {
            const firenvim = global.firenvimElems.get(frameId);
            firenvim.hide();
            _focusInput(global, firenvim, true);
        },
        killEditor: (frameId: number) => {
            const firenvim = global.firenvimElems.get(frameId);
            firenvim.detachFromPage();
            const conf = getConf();
            _focusInput(global, firenvim, conf.takeover !== "once");
            global.firenvimElems.delete(frameId);
        },
        pressKeys: (frameId: number, keys: string[]) => {
            global.firenvimElems.get(frameId).pressKeys(keysToEvents(keys));
        },
        resizeEditor: (frameId: number, width: number, height: number) => {
            const elem = global.firenvimElems.get(frameId);
            elem.resizeTo(width, height, true);
            elem.putEditorCloseToInputOriginAfterResizeFromFrame();
        },
        registerNewFrameId: (frameId: number) => global.registerNewFrameId(frameId),
        sendKey: (key: string) => {
            const firenvim = getFocusedElement(global.firenvimElems);
            if (firenvim !== undefined) {
                firenvim.sendKey(key);
            } else {
                // It's important to throw this error as the background script
                // will execute a fallback
                throw new Error("No firenvim frame selected");
            }
        },
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
        },
        setElementContent: (frameId: number, text: string) => {
            return global.firenvimElems.get(frameId).setPageElementContent(text);
        },
        setElementCursor: (frameId: number, line: number, column: number) => {
            return global.firenvimElems.get(frameId).setPageElementCursor(line, column);
        },
    };
}
