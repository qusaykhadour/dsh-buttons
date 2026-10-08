/**
 * Wiring test for the browser half: loads the bundle with a stubbed module
 * loader, React and primitives, then checks that `apply()` registers every slot
 * entry and that each component renders (or stays null) without throwing.
 *
 *   node test/client-bundle.test.mjs
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '..', 'lib', 'client.js')

/** Minimal React stand-in: descriptors only, no rendering. */
function fakeReact() {
  return {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({
      type,
      props: props ?? {},
      children: children.length === 1 && Array.isArray(children[0]) ? children[0] : children,
    }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
  }
}

/** Primitive stand-ins; every one is a component-shaped function. */
function fakePrimitives() {
  const component = (name) => {
    const Stub = () => null
    Stub.displayName = name
    return Stub
  }
  return {
    Modal: component('Modal'),
    Button: component('Button'),
    MenuItemButton: component('MenuItemButton'),
    Tooltip: component('Tooltip'),
    IconChecklistOutlineRegular: component('IconChecklistOutlineRegular'),
    IconCheckCircleFillRegular: component('IconCheckCircleFillRegular'),
    IconTrashOutlineRegular: component('IconTrashOutlineRegular'),
  }
}

/**
 * Load the bundle through the loader hook the app provides.
 * @returns the module exports and the recorded registrations.
 */
async function loadBundle() {
  let definition = null
  globalThis.window = {
    __ModuleLoader__: {
      load: (value) => {
        definition = value
      },
    },
  }
  await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)
  assert.notEqual(definition, null, 'the bundle must register a factory')
  assert.equal(definition.id, 'dsh-buttons')

  const React = fakeReact()
  const primitives = fakePrimitives()
  const require = (id) => {
    if (id === 'react') return React
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require: ${id}`)
  }
  const exports = definition.factory(require)
  return { exports, React, primitives }
}

/** A ctx recording every slot registration. */
function fakeContext() {
  const registrations = []
  const archived = []
  const ctx = {
    locale: { getSnapshot: () => ({ active: 'ar' }) },
    get: (name) => {
      if (name === 'sessions') {
        return { list: { getSnapshot: () => ({ byId: { 'session-1': { displayTitle: 'محادثة تجريبية' } } }) } }
      }
      if (name === 'workspaces') {
        return {
          archiveSession: (id) => {
            archived.push(id)
            return Promise.resolve()
          },
        }
      }
      return undefined
    },
    slots: {
      inject: (name, factory) => {
        for (const entry of factory()) registrations.push(entry)
      },
      register: (options, component) => ({ ...options, component }),
    },
  }
  return { ctx, registrations, archived }
}

test('registers the row pick button, two menu entries and two overlays', async () => {
  const { exports } = await loadBundle()
  const { ctx, registrations } = fakeContext()

  exports.apply(ctx)

  assert.deepEqual(exports.inject, ['slots', 'locale', 'sessions', 'workspaces'])
  const bySlot = registrations.map((entry) => `${entry.name}#${entry.id}`)
  assert.deepEqual(bySlot, [
    'sidebar.workspaces.session.row.action#session-delete-pick-row',
    'sidebar.workspaces.session.menu.item#session-delete-pick',
    'sidebar.workspaces.session.menu.item#session-delete',
    'shell.overlay#session-delete-bar',
    'shell.overlay#session-delete-confirm',
  ])
  for (const entry of registrations) {
    assert.equal(typeof entry.component, 'function', `${entry.id} must render a component`)
  }
  // Two menu entries must not share an id, or one would shadow the other.
  const menuIds = registrations.filter((e) => e.name === 'sidebar.workspaces.session.menu.item').map((e) => e.id)
  assert.equal(new Set(menuIds).size, menuIds.length)
})

test('components render with an empty selection and stay clickable with one', async () => {
  const { exports } = await loadBundle()
  const { ctx, registrations } = fakeContext()
  exports.apply(ctx)
  const bySlot = Object.fromEntries(registrations.map((entry) => [`${entry.name}#${entry.id}`, entry.component]))

  const menuState = () => [false, () => {}]
  const pickButton = bySlot['sidebar.workspaces.session.row.action#session-delete-pick-row']
  const pickMenu = bySlot['sidebar.workspaces.session.menu.item#session-delete-pick']
  const deleteMenu = bySlot['sidebar.workspaces.session.menu.item#session-delete']

  const button = pickButton({ sessionId: 'session-1' })
  assert.equal(button.type.displayName, 'Tooltip')
  assert.equal(button.props.children.props['aria-pressed'], false)
  assert.equal(button.props.children.props['aria-label'], 'تحديد للحذف الجماعي')
  button.props.children.props.onClick()
  assert.equal(pickButton({ sessionId: 'session-1' }).props.children.props['aria-pressed'], true)

  const menu = pickMenu({ sessionId: 'session-2', useMenuOpenState: menuState })
  assert.equal(menu.type.displayName, 'MenuItemButton')
  assert.equal(menu.props.children, 'تحديد للحذف الجماعي')
  // session-1 is picked by now, so the row menu follows the selection.
  assert.equal(
    deleteMenu({ sessionId: 'session-2', useMenuOpenState: menuState }).props.children,
    'حذف المحدد (1)',
  )
})

test('the picked count drives the bar and the bulk confirmation', async () => {
  const { exports } = await loadBundle()
  const { ctx, registrations } = fakeContext()
  exports.apply(ctx)
  const bySlot = Object.fromEntries(
    registrations.map((entry) => [`${entry.name}#${entry.id}`, entry.component]),
  )
  const bar = bySlot['shell.overlay#session-delete-bar']
  const dialog = bySlot['shell.overlay#session-delete-confirm']
  const pickMenu = bySlot['sidebar.workspaces.session.menu.item#session-delete-pick']
  const menuState = () => [false, () => {}]

  assert.equal(bar(), null, 'nothing picked: no bar')
  assert.equal(dialog({}), null, 'nothing pending: no dialog')

  pickMenu({ sessionId: 'session-1', useMenuOpenState: menuState }).props.onSelect()
  pickMenu({ sessionId: 'session-2', useMenuOpenState: menuState }).props.onSelect()

  const rendered = bar()
  assert.notEqual(rendered, null, 'picked Sessions must surface the bar')
  const [, deleteButton, clearButton] = rendered.children
  assert.equal(deleteButton.props.children, 'حذف المحدد (2)')
  assert.equal(clearButton.props.children, 'إلغاء التحديد')

  deleteButton.props.onClick()
  const modal = dialog({})
  assert.equal(modal.type.displayName, 'Modal')
  assert.equal(modal.props.title, 'حذف 2 محادثة نهائياً؟')
  const [list] = modal.props.children.children
  assert.equal(list.children.length, 2, 'both titles are listed before confirming')
  assert.deepEqual(
    modal.props.footer.children.map((child) => child.props.children),
    ['إلغاء', 'حذف نهائي (2)'],
  )

  clearButton.props.onClick()
  assert.equal(bar(), null, 'clearing the selection hides the bar')
})

test('a row menu never ignores the picked set', async () => {
  const { exports } = await loadBundle()
  const { ctx, registrations } = fakeContext()
  exports.apply(ctx)
  const bySlot = Object.fromEntries(
    registrations.map((entry) => [`${entry.name}#${entry.id}`, entry.component]),
  )
  const pickMenu = bySlot['sidebar.workspaces.session.menu.item#session-delete-pick']
  const deleteMenu = bySlot['sidebar.workspaces.session.menu.item#session-delete']
  const dialog = bySlot['shell.overlay#session-delete-confirm']
  let closes = 0
  const menuState = () => [false, (value) => { if (value === false) closes += 1 }]

  // Nothing picked: the row menu deletes exactly that Session.
  const alone = deleteMenu({ sessionId: 'session-7', useMenuOpenState: menuState })
  assert.equal(alone.props.children, 'حذف المحادثة نهائياً')
  alone.props.onSelect()
  assert.equal(closes, 1, 'selecting a menu item closes the menu')
  assert.equal(dialog({}).props.title, 'حذف المحادثة نهائياً؟')
  dialog({}).props.onClose()

  // Two picked: the same row menu must act on the picked set, not on its own row.
  pickMenu({ sessionId: 'session-1', useMenuOpenState: menuState }).props.onSelect()
  pickMenu({ sessionId: 'session-2', useMenuOpenState: menuState }).props.onSelect()

  const grouped = deleteMenu({ sessionId: 'session-9', useMenuOpenState: menuState })
  assert.equal(grouped.props.children, 'حذف المحدد (2)')
  grouped.props.onSelect()

  const modal = dialog({})
  assert.equal(modal.props.title, 'حذف 2 محادثة نهائياً؟')
  const [list] = modal.props.children.children
  assert.deepEqual(
    list.children.map((item) => item.children[0]),
    ['محادثة تجريبية', 'session-2'],
    'the dialog names the picked Sessions, not the row that opened it',
  )
})
