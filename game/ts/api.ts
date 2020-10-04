import { Elemental4API } from "../../shared/api/elemental4";
import { Elemental5API } from "../../shared/api/elemental5";
import { DebugAllColorsAPI } from "../../shared/api/debug-allcolors";
import { LedomElementalAPI } from "../../shared/api/ledom";
import { ElementalBaseAPI, ElementalConfig, ElementalLoadingUi, ElementalSubAPIs, getSubAPI, ServerSavefileEntry } from "../../shared/elem";
import { escapeHTML } from "../../shared/shared";
import { OFFLINE } from "./index";
import { SingleplayerAPI } from "./api-singleplayer";
import { asyncAlert, asyncConfirm, asyncPrompt, SimpleDialog } from "./dialog";
import { addElementToGame, ClearElementGameUi, InitElementNews } from "./element-game";
import { createLoadingUi } from "./loading";
import { canCreateSaveFile, getActiveSaveFile, getAPISaveFile, getAPISaveFiles, getOwnedElements, getServer, installServer, setActiveSaveFile } from "./savefile";
import { endStatistics, startStatistics } from "./statistics";

// @ts-ignore
class IHateTypescript extends ElementalBaseAPI {
  baseUrl = '';
}

const apiTypeMap: Record<string, typeof IHateTypescript> = {
  'internal:all-colors': DebugAllColorsAPI,
  'internal:singleplayer': SingleplayerAPI,
  'elemental4': Elemental4API,
  'e4': LedomElementalAPI,
  'elemental5': Elemental5API,
};

let currentAPI: ElementalBaseAPI;
let currentSaveFile: string;
let currentSaveFileList: ServerSavefileEntry[];

const builtInApis = {
  'internal:all-colors': { type: "internal:all-colors", name: "All Colors" },
  'internal:singleplayer': { type: "internal:singleplayer", name: "Singleplayer with Element Packs" },
}

export async function getSupportedServerTypes() {
  return Object.keys(apiTypeMap);
}

export async function connectApi(baseUrl: string, config: ElementalConfig, ui?: ElementalLoadingUi) {
  let selfMadeUi = false;
  if(!ui) {
    ui = createLoadingUi();
    selfMadeUi = true;
  }
  await endStatistics()
  try {
    const json = config || builtInApis[baseUrl] || (
      OFFLINE
        ? (await getServer(baseUrl)).config
        : await fetch(baseUrl + '/elemental.json').then(x => x.json())
    );
    installServer(baseUrl, json)
    const API = apiTypeMap[json.type];

    const api = new API({
      baseUrl,
      config: json,
      saveFile: await getAPISaveFile(baseUrl),
      ui: {
        alert: (o) => asyncAlert(o.title, o.text),
        confirm: (o) => asyncConfirm(o.title, o.text, o.trueButton, o.falseButton),
        prompt: (o) => asyncPrompt(o.title, o.text, o.defaultText, o.confirmButton, o.cancelButton),
        popup: (o) => Promise.resolve(null),
      }
    });
    let isOpen;
    if (OFFLINE) {
      const offlineApi = getSubAPI(api, 'offline');
      if(offlineApi) {
        isOpen = await offlineApi.offlineOpen(ui);
      } else {
        throw new Error("Server requires an internet connection.");
      }
    } else {
      isOpen = await api.open(ui);
    }
    if (!isOpen) {
      throw new Error("Could not open API connection.");
    }
    if(selfMadeUi) {
      (ui as any).dispose();
    }
    if (currentAPI) {
      try {
        currentAPI.close();
      } catch (error) {
        console.error('Could not close the current API. This will probably cause a memory leak.');
        console.error(error);
      }
    }

    ClearElementGameUi();
    currentAPI = api;

    document.querySelector('#server-name').innerHTML = '<b>Server:</b> ' + escapeHTML(`${json.name || "Untitled Server"} — ${baseUrl}`);
    document.querySelector('#server-title').innerHTML = escapeHTML(json.name || `Unnamed Server (type=${json.type})`);
    document.querySelector('#server-description').innerHTML = escapeHTML(json.description || `[No description provided]`);
    if (json.icon) {
      document.querySelector('#server-icon').setAttribute('style', `background-image:url(${json.icon});background-size:cover;`)
    } else {
      document.querySelector('#server-icon').setAttribute('style', ``)
    }

    await InitElementNews();

    await onSaveFileLoad();

    await startStatistics();

    return true;
  } catch (error) {
    console.error(error);
    if(selfMadeUi) {
      (ui as any).dispose();
    }
    
    if(currentAPI)startStatistics();

    throw error; 
  }
}

export async function setAPISaveFile(id: string) {
  if(id !== currentSaveFile) {
    await endStatistics()
    await ClearElementGameUi();
    await setActiveSaveFile(currentAPI, id);
    await onSaveFileLoad();
    await startStatistics();
  }
}

async function onSaveFileLoad() {
  const ownedElements = await getOwnedElements(currentAPI);
  const elementsToAdd = await Promise.all(ownedElements.map(id => currentAPI.getElement(id)));
  elementsToAdd.forEach(elem => addElementToGame(elem));

  await recalculateSavefileDropdown();
}

export async function recalculateSavefileDropdown() {
  currentSaveFileList = await getAPISaveFiles(currentAPI);
  currentSaveFile = await getActiveSaveFile(currentAPI);

  const changeSaveFile = document.getElementById('change-savefile') as HTMLSelectElement;
  changeSaveFile.innerHTML = currentSaveFileList.map(x => `<option value="save:${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join('')
  changeSaveFile.value = 'save:' + currentSaveFile;
  
  (document.getElementById('modify-savefile-create') as HTMLOptionElement).disabled = !canCreateSaveFile(currentAPI, '');
  (document.getElementById('modify-savefile-rename') as HTMLOptionElement).disabled = !true;  
  (document.getElementById('modify-savefile-delete') as HTMLOptionElement).disabled = !true;  
}

export function getAPI(): ElementalBaseAPI
export function getAPI<SubAPIName extends keyof ElementalSubAPIs>(type?: SubAPIName): null | (ElementalBaseAPI & ElementalSubAPIs[SubAPIName])
export function getAPI(type?: any) {
  return getSubAPI(currentAPI, type) as any;
}