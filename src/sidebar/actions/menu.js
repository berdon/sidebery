import CommonActions from '../../actions/menu'
import { MENU_OPTIONS, RGB_COLORS } from '../../defaults'
import Actions from '../actions'

const xmlSerializer = new XMLSerializer()

/**
 * Open context menu
 */
async function openCtxMenu(x, y) {
  if (this.state.ctxMenuNative) browser.menus.removeAll()
  if (!this.state.selected.length) return

  let nodeType, options, opts = []
  if (typeof this.state.selected[0] === 'number') {
    nodeType = 'tab'
    options = this.state.tabsMenu
  } else {
    nodeType = 'bookmark'
    options = this.state.bookmarksMenu
  }

  for (let optName of options) {
    if (optName instanceof Array) {
      let inlineMenu = { inline: true, options: [] }
      for (let subOpt of optName) {
        if (typeof subOpt === 'object') {
          if (this.state.ctxMenuNative) inlineMenu.options.push(subOpt)
          continue
        }
        let option, optGen = MENU_OPTIONS[subOpt]
        if (subOpt.startsWith('separator')) option = 'separator'
        else if (optGen) option = optGen(this.state)
        if (!option) continue

        inlineMenu.options = inlineMenu.options.concat(option)
      }

      opts.push(inlineMenu)
      continue
    }

    let option, optGen = MENU_OPTIONS[optName]
    if (optName.startsWith('separator')) option = 'separator'
    else if (optGen) option = optGen(this.state)
    if (!option) continue

    let lastGroup = opts[opts.length - 1]
    if (!lastGroup || lastGroup.inline) {
      lastGroup = { inline: false, options: [] }
      opts.push(lastGroup)
    }

    lastGroup.options = lastGroup.options.concat(option)
  }

  opts = normalizeMenu(opts, this.state.ctxMenuNative)

  if (this.state.ctxMenuNative) {
    let parentId, parentName
    for (let group of opts) {
      for (let opt of group.options) {
        if (opt.name) {
          parentId = createNativeSubMenuOption(nodeType, opt.name)
          parentName = opt.name
          continue
        }
        createNativeOption(nodeType, opt, parentId, parentName)
      }
      parentId = undefined
      parentName = undefined
    }
    return
  } else {
    for (let group of opts) {
      if (group.inline) continue
      let groupOpts = group.options
      if (groupOpts[0] === 'separator') groupOpts.shift()
      if (groupOpts[groupOpts.length - 1] === 'separator') groupOpts.pop()
    }
  }

  this.state.ctxMenu = {
    x,
    y,
    opts,
    off: () => this.actions.resetSelection(),
  }
}

function normalizeMenu(menu, isNative) {
  menu = menu.filter(group => {
    let isInline = group.inline
    group.options = group.options.filter((opt, i, arr) => {
      if (opt === 'separator') {
        if (isNative) {
          if (i === 0 && isInline) return false
        } else {
          if (i === 0) return false
        }

        let nextOpt = arr[i + 1]
        if (nextOpt && nextOpt === 'separator') return false

        if (isNative) {
          if (i === arr.length - 1 && isInline) return false
        } else {
          if (i === arr.length - 1) return false
        }
      }
      return true
    })

    if (!group.options.length) return false
    if (group.options[0].name && group.options.length === 1) return false
    if (group.options.length === 1 && group.options[0] === 'separator') {
      return false
    }
    return true
  })
  if (menu[0] && menu[0].options[0] === 'separator') {
    menu[0].options.shift()
  }
  return menu
}

function createNativeOption(ctx, option, parentId, parentName) {
  if (option === 'separator') {
    browser.menus.create({
      type: 'separator',
      contexts: [ctx],
      parentId,
    })
    return
  }

  if (option instanceof Array) {
    for (let opt of option) {
      createNativeOption(ctx, opt, parentId)
    }
    return
  }

  let icon
  if (option.icon && RGB_COLORS[option.color]) {
    let s = xmlSerializer.serializeToString(document.getElementById(option.icon))
    s = '<svg fill="' + RGB_COLORS[option.color] + '" ' + s.slice(5)
    icon = 'data:image/svg+xml;base64,' + window.btoa(s)
  }

  let optProps = { type: 'normal', contexts: [ctx], viewTypes: ['sidebar'] }
  if (parentId) optProps.parentId = parentId

  if (option.inactive) optProps.enabled = false

  optProps.title = option.nativeLabel || option.label
  if (
    parentName &&
    optProps.title.startsWith(parentName) &&
    optProps.title.length > parentName.length
  ) {
    optProps.title = optProps.title.slice(parentName.length).trim()
    optProps.title = optProps.title[0].toUpperCase() + optProps.title.slice(1)
  }

  if (icon) optProps.icons = { '16': icon }
  optProps.onclick = () => {
    if (typeof option.action === 'string') {
      if (!option.args) Actions[option.action]()
      else Actions[option.action](...option.args)
    }
    if (typeof option.action === 'function') {
      if (!option.args) option.action()
      else option.action(...option.args)
    }
    Actions.resetSelection()
  }

  browser.menus.create(optProps)
}

function createNativeSubMenuOption(ctx, title) {
  let optProps = {
    type: 'normal',
    contexts: [ctx],
    viewTypes: ['sidebar'],
    title: title,
  }
  return browser.menus.create(optProps)
}

/**
 * Close context menu
 */
function closeCtxMenu() {
  if (this.state.ctxMenu) {
    if (this.state.ctxMenu.off) this.state.ctxMenu.off()
    this.state.ctxMenu = null
  }
}

export default {
  ...CommonActions,

  openCtxMenu,
  closeCtxMenu,
}