import { DEFAULT_SETTINGS, CUSTOM_CSS_VARS } from '../defaults'
import { noiseBg } from '../noise-bg'
import Utils from '../utils'

const tabsBoxEl = document.getElementById('tabs')
let newTabEl, groupTabId, groupTabIndex, tabs = []
let groupLen, groupParentId

void (async function() {
  let { settings } = await browser.storage.local.get({ settings: DEFAULT_SETTINGS })

  document.body.setAttribute('data-style', settings.style || 'dark')
  document.body.setAttribute('data-layout', settings.groupLayout || 'grid')
  document.body.setAttribute('data-animations', settings.animations ? 'fast' : 'none')

  initTheme(settings.theme)
  loadCustomCSS()

  if (settings.bgNoise) {
    noiseBg(document.body, {
      width: 300,
      height: 300,
      gray: [12, 175],
      alpha: [0, 66],
      spread: [0, 9],
    })
    let scaleShift = ~~window.devicePixelRatio
    let sW = 300 >> scaleShift
    let sH = 300 >> scaleShift
    document.body.style.backgroundSize = `${sW}px ${sH}px`
  }

  // Set user styles
  let { cssVars } = await browser.storage.local.get({ cssVars: {} })
  for (let key of Object.keys(CUSTOM_CSS_VARS)) {
    if (!cssVars[key]) continue
    document.body.style.setProperty(Utils.toCSSVarName(key), cssVars[key])
  }

  // Load current window and get url-hash
  const win = await browser.windows.getCurrent()
  const hash = decodeURI(window.location.hash.slice(1))

  // Set title of group page
  const titleEl = document.getElementById('title')
  const hashData = hash.split(':id:')
  const title = hashData[0]
  const groupId = hashData[1]
  titleEl.value = title
  document.title = title

  // Listen chagnes of title
  titleEl.addEventListener('input', e => {
    const normTitle = e.target.value.trim()
    document.title = normTitle
    window.location.hash = `#${encodeURI(normTitle)}:id:${groupId}`
  })

  const groupInfo = await browser.runtime.sendMessage({
    action: 'getGroupInfo',
    windowId: win.id,
    arg: hash,
  })
  if (!groupInfo) return

  tabs = groupInfo.tabs || []
  groupTabId = groupInfo.id || ''
  groupTabIndex = groupInfo.index || 0
  groupLen = groupInfo.len || 0
  groupParentId = groupInfo.parentId

  while (tabsBoxEl.lastChild) {
    tabsBoxEl.removeChild(tabsBoxEl.lastChild)
  }

  for (let tab of tabs) {
    createTabEl(tab, event => onTabClick(event, tab))
    tabsBoxEl.appendChild(tab.el)
  }

  createNewTabButton()
  updateScreenshots()

  document.body.addEventListener('mousedown', e => {
    if (e.button === 2 && groupParentId) {
      e.preventDefault()
      browser.tabs.update(groupParentId, { active: true })
    }
  })

  document.body.addEventListener('contextmenu', e => e.preventDefault())

  // Set listeners
  browser.runtime.onMessage.addListener(msg => {
    if (msg.windowId !== undefined && msg.windowId !== win.id) return
    if (msg.instanceType !== undefined && msg.instanceType !== 'group') return

    if (msg.name === 'update') onGroupUpdated(msg)
    if (msg.name === 'create') onTabCreated(msg)
    if (msg.name === 'updateTab') onTabUpdated(msg)
    if (msg.name === 'remove') onTabRemoved(msg)
  })
})()

/**
 * Handle group page update msg
 */
function onGroupUpdated(msg) {
  let i
  groupTabId = msg.id
  groupTabIndex = msg.index
  groupLen = msg.len
  groupParentId = msg.parentId

  for (i = 0; i < msg.tabs.length; i++) {
    let newTab = msg.tabs[i]
    let oldTab = tabs[i]
    if (!oldTab) {
      createTabEl(newTab, event => onTabClick(event, newTab))
      newTabEl.before(newTab.el)
      tabs[i] = newTab
    } else {
      updateTab(oldTab, newTab)
    }
  }

  for (;i < tabs.length; i++) {
    let tab = tabs[i]
    tab.el.remove()
    tabs.splice(i, 1)
  }
}

/**
 * Handle creating tab
 */
async function onTabCreated(tab) {
  createTabEl(tab, event => onTabClick(event, tab))

  let index = tab.index - groupTabIndex - 1
  if (index === -1 || index === tabs.length) {
    newTabEl.before(tab.el)
    tabs.push(tab)
  } else {
    tabs[index].el.before(tab.el)
    tabs.splice(index, 0, tab)
  }

  groupLen++
  await Utils.sleep(256)
  loadScreenshot(tab)
}

/**
 * Handle tab update msg
 */
function onTabUpdated(msg) {
  let tab = tabs.find(t => t.id === msg.id)
  if (!tab) return

  tab.el.setAttribute('data-status', msg.status)
  if (msg.status === 'complete') {
    tab.favEl.style.backgroundImage = `url(${msg.favIconUrl})`
    loadScreenshot(tab)
  }

  tab.titleEl.innerText = msg.title
  tab.title = msg.title

  if (msg.url.startsWith('moz-ext')) tab.urlEl.innerText = ''
  else tab.urlEl.innerText = msg.url
  tab.url = msg.url

  tab.el.setAttribute('data-discarded', msg.discarded)
  tab.discarded = msg.discarded

  tab.el.setAttribute('data-lvl', msg.lvl)
  tab.lvl = msg.lvl
}

/**
 * Handle tab remove msg
 */
function onTabRemoved(msg) {
  let index = tabs.findIndex(t => t.id === msg.id)
  if (index === -1) return
  tabs[index].el.remove()
  tabs.splice(index, 1)
  groupLen--
}

/**
 * Create new-tab button
 */
function createNewTabButton() {
  newTabEl = document.createElement('div')
  newTabEl.classList.add('new-tab')
  newTabEl.setAttribute('title', 'Create new tab')
  tabsBoxEl.appendChild(newTabEl)

  newTabEl.addEventListener('mousedown', event => {
    event.stopPropagation()
    event.preventDefault()
    browser.tabs.create({
      index: groupTabIndex + groupLen + 1,
      openerTabId: groupTabId,
      active: event.button === 0 ? true : false,
    })
  })
}

/**
 * Create tab element
 */
function createTabEl(info, clickHandler) {
  info.el = document.createElement('div')
  info.el.classList.add('tab')
  info.el.title = info.url
  info.el.setAttribute('data-lvl', info.lvl)
  info.el.setAttribute('data-discarded', info.discarded)

  info.bgEl = document.createElement('div')
  info.bgEl.classList.add('bg')
  info.el.appendChild(info.bgEl)

  info.favEl = document.createElement('div')
  info.favEl.classList.add('fav')
  info.favEl.style.backgroundImage = `url(${info.favIconUrl})`
  info.el.appendChild(info.favEl)

  let infoEl = document.createElement('div')
  infoEl.classList.add('info')
  info.el.appendChild(infoEl)

  info.titleEl = document.createElement('h3')
  info.titleEl.classList.add('tab-title')
  info.titleEl.innerText = info.title
  infoEl.appendChild(info.titleEl)

  info.urlEl = document.createElement('a')
  info.urlEl.classList.add('tab-url')
  info.urlEl.setAttribute('href', info.url)
  info.urlEl.addEventListener('click', e => e.preventDefault())
  if (info.url.startsWith('moz-ext')) info.urlEl.innerText = ''
  else info.urlEl.innerText = info.url
  infoEl.appendChild(info.urlEl)

  let ctrlsEl = document.createElement('div')
  ctrlsEl.classList.add('ctrls')
  info.el.appendChild(ctrlsEl)

  let discardBtnEl = createButton('icon_discard', 'discard-btn', event => {
    event.stopPropagation()
    browser.tabs.discard(info.id)
    info.el.setAttribute('data-discarded', true)
  })
  ctrlsEl.appendChild(discardBtnEl)

  let reloadBtnEl = createButton('icon_reload', 'reload-btn', event => {
    event.stopPropagation()
    if (event.button === 0) browser.tabs.reload(info.id)
    if (event.button === 1) {
      let index = tabs.findIndex(t => t.id === info.id)
      browser.tabs.create({
        url: info.url,
        index: groupTabIndex + index + 1,
        openerTabId: info.id,
        active: false,
      })
    }
  })
  ctrlsEl.appendChild(reloadBtnEl)

  let closeBtnEl = createButton('icon_close', 'close-btn', event => {
    event.stopPropagation()
    browser.tabs.remove(info.id)
  })
  ctrlsEl.appendChild(closeBtnEl)

  info.el.addEventListener('mousedown', e => e.stopPropagation())
  info.el.addEventListener('click', clickHandler)
}

/**
 * Create button element
 */
function createButton(svgId, className, clickHandler) {
  let btnEl = document.createElement('div')
  btnEl.classList.add('btn', className)

  let svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')  
  svgEl.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink')
  btnEl.appendChild(svgEl)

  let useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use')  
  useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + svgId)
  svgEl.appendChild(useEl)

  btnEl.addEventListener('mousedown', clickHandler)

  return btnEl
}

/**
 * Load screenshots
 */
async function loadScreenshot(tab) {
  if (tab.discarded) return
  if (!browser.tabs.captureTab) return
  let screen = await browser.tabs.captureTab(tab.id, { format: 'jpeg', quality: 90 })
  tab.bgEl.style.backgroundImage = `url(${screen})`
}

/**
 * Sequentially update screenshots
 */
async function updateScreenshots() {
  for (let tab of tabs) {
    await loadScreenshot(tab)
  }
}

/**
 * Handle tab click
 */
async function onTabClick(event, tab) {
  event.stopPropagation()
  await browser.runtime.sendMessage({
    instanceType: 'sidebar',
    action: 'expTabsBranch',
    arg: groupTabId,
  })
  browser.tabs.update(tab.id, { active: true })
}

/**
 * Update tab
 */
function updateTab(oldTab, newTab) {
  let titleChanged = oldTab.title !== newTab.title
  let urlChanged = oldTab.url !== newTab.url

  if (titleChanged) oldTab.titleEl.innerText = newTab.title
  if (urlChanged) {
    if (newTab.url.startsWith('moz-ext')) oldTab.urlEl.innerText = ''
    else oldTab.urlEl.innerText = newTab.url
  }
  if (oldTab.lvl !== newTab.lvl) oldTab.el.setAttribute('data-lvl', newTab.lvl)
  if (oldTab.discarded !== newTab.discarded) {
    oldTab.el.setAttribute('data-discarded', newTab.discarded)
  }
  if (oldTab.favIconUrl !== newTab.favIconUrl) {
    oldTab.favEl.style.backgroundImage = `url(${newTab.favIconUrl})`
  }

  Object.assign(oldTab, newTab)

  if (titleChanged || urlChanged) loadScreenshot(oldTab)
}

/**
 * Load predefined theme and apply it
 */
function initTheme(theme) {
  let themeLinkEl = document.getElementById('theme_link')

  // Remove theme css
  if (theme === 'none') {
    if (themeLinkEl) themeLinkEl.setAttribute('disabled', 'disabled')
    return
  } else {
    if (themeLinkEl) themeLinkEl.removeAttribute('disabled')
  }

  if (!themeLinkEl) {
    themeLinkEl = document.createElement('link')
    themeLinkEl.id = 'theme_link'
    themeLinkEl.type = 'text/css'
    themeLinkEl.rel = 'stylesheet'
    document.head.appendChild(themeLinkEl)
  }

  themeLinkEl.href = `../themes/${theme}/group.css`
}

/**
 * Load custom css and apply it
 */
async function loadCustomCSS() {
  let ans = await browser.storage.local.get('groupCSS')
  if (!ans || !ans.groupCSS) return

  applyCustomCSS(ans.groupCSS)
}

/**
 * Update custom css
 */
function applyCustomCSS(css) {
  // Find or create new style element
  let customStyleEl = document.getElementById('custom_css')
  if (!customStyleEl) {
    customStyleEl = document.createElement('style')
    customStyleEl.id = 'custom_css'
    customStyleEl.type = 'text/css'
    customStyleEl.rel = 'stylesheet'
    document.head.appendChild(customStyleEl)
  } else {
    while (customStyleEl.lastChild) {
      customStyleEl.removeChild(customStyleEl.lastChild)
    }
  }

  // Apply css
  if (css) {
    customStyleEl.appendChild(document.createTextNode(css))
  }
}