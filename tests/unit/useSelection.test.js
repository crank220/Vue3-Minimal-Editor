import { describe, expect, it } from 'vitest'
import { createSelectionStore } from '../../src/composables/useSelection'

describe('createSelectionStore', () => {
  it('keeps saved ranges isolated per editor instance', () => {
    const firstRoot = document.createElement('div')
    const secondRoot = document.createElement('div')
    firstRoot.innerHTML = '<span>First editor</span>'
    secondRoot.innerHTML = '<span>Second editor</span>'
    document.body.append(firstRoot, secondRoot)

    const firstStore = createSelectionStore()
    const secondStore = createSelectionStore()
    const range = document.createRange()
    range.selectNodeContents(firstRoot.querySelector('span'))

    firstStore.setRange(range)

    expect(firstStore.getRange(firstRoot)).not.toBeNull()
    expect(secondStore.getRange(firstRoot)).toBeNull()
    expect(firstStore.getRange(secondRoot)).toBeNull()
    expect(firstStore.getRange(firstRoot)).toBeNull()

    firstRoot.remove()
    secondRoot.remove()
  })
})
