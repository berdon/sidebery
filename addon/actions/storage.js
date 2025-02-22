/**
 * Handle changes of all storages (update current state)
 */
function onStorageChange(changes, type) {
  if (type !== 'local') return

  if (changes.panels) this.actions.updatePanels(changes.panels.newValue)
  if (changes.settings) this.settings = changes.settings.newValue
}

function setupStorageListeners() {
  browser.storage.onChanged.addListener(this.actions.onStorageChange)
}

export default {
  onStorageChange,
  setupStorageListeners,
}